import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { URI } from 'vscode-uri';
import { CompletionItem, CompletionItemKind, VelinSchemaReference } from '@velin/shared';

export interface DefinitionLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export class TypeScriptService {
  private programs: Map<string, ts.Program> = new Map();
  
  async getCompletions(
    schemaRef: VelinSchemaReference,
    expression: string,
    cursorPos: number,
    documentUri: string,
    currentLine?: number,
    documentText?: string,
  ): Promise<CompletionItem[]> {
    if (schemaRef.type === 'global-type') {
      return this.getGlobalTypeCompletions(schemaRef, expression, cursorPos, documentUri, currentLine, documentText);
    }
    if (schemaRef.type === 'inline-script') {
      return this.getInlineScriptCompletions(schemaRef, expression, cursorPos, documentUri, currentLine, documentText);
    }

    try {
      const uri = URI.parse(documentUri);
      const documentPath = uri.fsPath;
      
      // Resolve schema path relative to the document
      if (!schemaRef.source) return [];
      const schemaFilePath = path.resolve(path.dirname(documentPath), schemaRef.source);
      
      if (!fs.existsSync(schemaFilePath)) {
        console.log(
          `[TypeScriptService] schema source not found: ${schemaFilePath} ` +
            `(resolved from "${schemaRef.source}" relative to ${documentPath}). ` +
            `Fix the path in the schema comment.`,
        );
        return [];
      }

      const workspaceRoot = this.getWorkspaceRoot(documentUri);
      const program = this.getOrCreateProgram(workspaceRoot, schemaFilePath);
      
      const sourceFile = program.getSourceFile(schemaFilePath);
      if (!sourceFile) {
        return [];
      }

      // Find the type/interface declaration
      const typeSymbol = this.findTypeSymbol(program, sourceFile, schemaRef.typeName || 'default');
      if (!typeSymbol) {
        return [];
      }

      // Parse the expression to understand what we're completing
      const expressionContext = this.parseExpression(expression, cursorPos);
      
      // Analyze scope for loop variables and template variables
      const scopeVars =
        currentLine !== undefined
          ? this.analyzeScopeAtLine(documentUri, currentLine, documentText)
          : {};

      // Get completions based on the expression context
      return this.getCompletionsFromType(program, typeSymbol, expressionContext, scopeVars);
    } catch (error: any) {
      console.log(`[TypeScriptService] ERROR in getCompletions: ${error.message}`);
      throw error;
    }
  }

  async getGlobalTypeCompletions(
    schemaRef: VelinSchemaReference,
    expression: string,
    cursorPos: number,
    documentUri: string,
    currentLine?: number,
    documentText?: string,
  ): Promise<CompletionItem[]> {
    try {
      const workspaceRoot = this.getWorkspaceRoot(documentUri);
      const program = this.getOrCreateProjectProgram(workspaceRoot);
      const typeName = schemaRef.typeName;
      if (!typeName) return [];

      // Search all source files for the type
      let typeSymbol: ts.Symbol | undefined;
      for (const sourceFile of program.getSourceFiles()) {
        if (sourceFile.isDeclarationFile) continue;
        typeSymbol = this.findTypeSymbol(program, sourceFile, typeName);
        if (typeSymbol) break;
      }

      if (!typeSymbol) {
        console.log(`[TypeScriptService] Global type "${typeName}" not found`);
        return [];
      }

      const expressionContext = this.parseExpression(expression, cursorPos);
      const scopeVars =
        currentLine !== undefined
          ? this.analyzeScopeAtLine(documentUri, currentLine, documentText)
          : {};

      return this.getCompletionsFromType(program, typeSymbol, expressionContext, scopeVars);
    } catch (error: any) {
      console.log(`[TypeScriptService] ERROR in getGlobalTypeCompletions: ${error.message}`);
      return [];
    }
  }

  /**
   * Resolve the identifier at `cursorPos` inside `expression` to its
   * declaration in the schema source file. Used by go-to-definition.
   */
  async getDefinition(
    schemaRef: VelinSchemaReference,
    expression: string,
    cursorPos: number,
    documentUri: string,
    currentLine?: number,
    documentText?: string,
  ): Promise<DefinitionLocation | null> {
    try {
      const scopeVars =
        currentLine !== undefined
          ? this.analyzeScopeAtLine(documentUri, currentLine, documentText)
          : {};

      // AST walk of the expression at the cursor. Understands `.prop`, `[idx]`,
      // and `foo()` hops — where extractPropertyChainAt gives up.
      const chain = extractHopsAt(expression, cursorPos);
      if (!chain) return null;

      const resolved = this.resolveRootType(schemaRef, documentUri);
      if (!resolved) return null;
      const { program, rootType } = resolved;
      const checker = program.getTypeChecker();

      // Handle loop variable at the head of the chain.
      let currentType = rootType;
      let hops = chain.hops;
      const rootName = chain.root;
      if (scopeVars[rootName]?.type === 'array item') {
        const match = scopeVars[rootName].documentation?.match(
          /from vln-loop:\w+="([^"]+)"/,
        );
        if (match) {
          const elem = elementTypeOfProperty(checker, currentType, match[1]);
          if (elem) currentType = elem;
        }
      } else {
        // Descend into the property named by the root identifier.
        const rootProp = currentType.getProperty(rootName);
        if (!rootProp?.valueDeclaration) {
          // If the target *is* the root (no hops), resolve to the root prop decl.
          if (hops.length === 0) {
            const decl = rootProp?.declarations?.[0];
            if (decl) return locationOfDecl(decl, schemaRef, { uri: documentUri, text: documentText });
          }
          return null;
        }
        if (hops.length === 0) {
          // Cursor is on the root identifier — jump to its declaration.
          const decl = rootProp.declarations?.[0] ?? rootProp.valueDeclaration;
          return locationOfDecl(decl, schemaRef, { uri: documentUri, text: documentText });
        }
        currentType = checker.getTypeOfSymbolAtLocation(
          rootProp,
          rootProp.valueDeclaration,
        );
      }

      // Walk hops. The last hop of kind 'prop' is the F12 target — capture its
      // symbol before advancing. For 'call'/'index' the last hop just moves
      // us; the F12 target must have been a 'prop' hop.
      let targetDecl: ts.Declaration | undefined;
      for (let i = 0; i < hops.length; i++) {
        const hop = hops[i];
        const isLast = i === hops.length - 1;
        if (hop.kind === 'prop') {
          const prop = currentType.getProperty(hop.name);
          if (!prop) return null;
          if (isLast) {
            targetDecl = prop.declarations?.[0] ?? prop.valueDeclaration;
            break;
          }
          if (!prop.valueDeclaration) return null;
          currentType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration);
        } else if (hop.kind === 'call') {
          const sig = checker.getSignaturesOfType(currentType, ts.SignatureKind.Call)[0];
          if (!sig) return null;
          // Unwrap `T | null | undefined` so subsequent `.prop` hops see T.
          currentType = checker.getNonNullableType(sig.getReturnType());
        } else if (hop.kind === 'index') {
          const elem =
            checker.getIndexTypeOfType(currentType, ts.IndexKind.Number) ??
            checker.getIndexTypeOfType(currentType, ts.IndexKind.String) ??
            (currentType as any).typeArguments?.[0];
          if (!elem) return null;
          currentType = checker.getNonNullableType(elem);
        }
      }

      if (!targetDecl) return null;
      return locationOfDecl(targetDecl, schemaRef);
    } catch (err: any) {
      console.log(`[TypeScriptService] getDefinition error: ${err.message}`);
      return null;
    }
  }

  resolveRootType(
    schemaRef: VelinSchemaReference,
    documentUri: string,
  ): { program: ts.Program; rootType: ts.Type } | null {
    const workspaceRoot = this.getWorkspaceRoot(documentUri);

    if (schemaRef.type === 'inline-script') {
      if (!schemaRef.source && !schemaRef.linkedPath) return null;
      const compiled = this.compileInlineScript(documentUri, schemaRef);
      if (!compiled?.rootType) return null;
      return { program: compiled.program, rootType: compiled.rootType };
    }

    let program: ts.Program;
    let typeSymbol: ts.Symbol | undefined;

    if (schemaRef.type === 'global-type') {
      program = this.getOrCreateProjectProgram(workspaceRoot);
      for (const sf of program.getSourceFiles()) {
        if (sf.isDeclarationFile) continue;
        typeSymbol = this.findTypeSymbol(program, sf, schemaRef.typeName || '');
        if (typeSymbol) break;
      }
    } else {
      if (!schemaRef.source) return null;
      const uri = URI.parse(documentUri);
      const schemaFilePath = path.resolve(
        path.dirname(uri.fsPath),
        schemaRef.source,
      );
      if (!fs.existsSync(schemaFilePath)) return null;
      program = this.getOrCreateProgram(workspaceRoot, schemaFilePath);
      const sf = program.getSourceFile(schemaFilePath);
      if (!sf) return null;
      typeSymbol = this.findTypeSymbol(program, sf, schemaRef.typeName || 'default');
    }
    if (!typeSymbol) return null;

    const checker = program.getTypeChecker();
    const rootType: ts.Type =
      typeSymbol.flags & ts.SymbolFlags.Interface
        ? checker.getDeclaredTypeOfSymbol(typeSymbol)
        : typeSymbol.valueDeclaration
        ? checker.getTypeOfSymbolAtLocation(typeSymbol, typeSymbol.valueDeclaration)
        : checker.getDeclaredTypeOfSymbol(typeSymbol);
    return { program, rootType };
  }

  /**
   * Completions when the schema is inferred from an inline `<script>` block
   * in the same HTML document (`@velin-schema: script`).
   */
  async getInlineScriptCompletions(
    schemaRef: VelinSchemaReference,
    expression: string,
    cursorPos: number,
    documentUri: string,
    currentLine?: number,
    documentText?: string,
  ): Promise<CompletionItem[]> {
    if (!schemaRef.source && !schemaRef.linkedPath) return [];
    const compiled = this.compileInlineScript(documentUri, schemaRef);
    if (!compiled?.rootType) return [];

    const expressionContext = this.parseExpression(expression, cursorPos);
    const scopeVars =
      currentLine !== undefined
        ? this.analyzeScopeAtLine(documentUri, currentLine, documentText)
        : {};

    return this.completionsFromRootType(
      compiled.program,
      compiled.rootType,
      expressionContext,
      scopeVars,
    );
  }

  async getJSDocCompletions(
    schemaRef: VelinSchemaReference,
    expression: string,
    cursorPos: number,
    documentUri: string
  ): Promise<CompletionItem[]> {
    // JSDoc references live in .js files. TypeScript's checker handles both
    // .ts and .js (with allowJs+checkJs) — reuse the normal completion path.
    return this.getCompletions(schemaRef, expression, cursorPos, documentUri);
  }

  private getWorkspaceRoot(documentUri: string): string {
    try {
      const startPath = path.dirname(URI.parse(documentUri).fsPath);
      let current = startPath;
      // Walk up until we find a marker file. Cap depth at 20 to avoid infinite
      // loops on malformed paths.
      for (let i = 0; i < 20; i++) {
        if (
          fs.existsSync(path.join(current, 'package.json')) ||
          fs.existsSync(path.join(current, 'tsconfig.json'))
        ) {
          return current;
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
      return startPath;
    } catch {
      return process.cwd();
    }
  }

  private getOrCreateProjectProgram(workspaceRoot: string): ts.Program {
    const cacheKey = `project:${workspaceRoot}`;
    if (this.programs.has(cacheKey)) {
      return this.programs.get(cacheKey)!;
    }

    console.log(`[TypeScriptService] Creating project-wide program for: ${workspaceRoot}`);
    const files = this.getAllSourceFiles(workspaceRoot);
    const options = this.getCompilerOptions(workspaceRoot);
    const program = ts.createProgram(files, options);
    
    this.programs.set(cacheKey, program);
    return program;
  }

  private getCompilerOptions(workspaceRoot: string): ts.CompilerOptions {
    const tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
    let compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      allowJs: true,
      checkJs: false,
      strict: false
    };

    if (fs.existsSync(tsconfigPath)) {
      const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      if (!configFile.error) {
        const parsedConfig = ts.parseJsonConfigFileContent(
          configFile.config,
          ts.sys,
          workspaceRoot
        );
        compilerOptions = parsedConfig.options;
      }
    }
    return compilerOptions;
  }

  private getOrCreateProgram(workspaceRoot: string, schemaFilePath: string): ts.Program {
    try {
      const cacheKey = `${workspaceRoot}:${schemaFilePath}`;
      if (this.programs.has(cacheKey)) {
        return this.programs.get(cacheKey)!;
      }

      const options = this.getCompilerOptions(workspaceRoot);
      const program = ts.createProgram([schemaFilePath], options);
      
      this.programs.set(cacheKey, program);
      return program;
    } catch (error: any) {
      console.log(`[TypeScriptService] ERROR in getOrCreateProgram: ${error.message}`);
      throw error;
    }
  }

  private getAllSourceFiles(dir: string): string[] {
    const files: string[] = [];
    
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        
        try {
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
            files.push(...this.getAllSourceFiles(fullPath));
          } else if (stat.isFile() && /\.(ts|js)$/.test(item)) {
            files.push(fullPath);
          }
        } catch (statError: any) {
          // Skip files/directories that can't be accessed (like broken symlinks)
          console.log(`[TypeScriptService] Skipping inaccessible path: ${fullPath} (${statError.message})`);
          continue;
        }
      }
    } catch (readdirError: any) {
      console.log(`[TypeScriptService] Cannot read directory: ${dir} (${readdirError.message})`);
    }
    
    return files;
  }

  private findTypeSymbol(program: ts.Program, sourceFile: ts.SourceFile, typeName: string): ts.Symbol | undefined {
    const typeChecker = program.getTypeChecker();
    
    // Look for interface, type alias, or class declarations
    for (const statement of sourceFile.statements) {
      if (ts.isInterfaceDeclaration(statement) || 
          ts.isTypeAliasDeclaration(statement) || 
          ts.isClassDeclaration(statement)) {
        if (statement.name?.getText() === typeName) {
          return typeChecker.getSymbolAtLocation(statement.name);
        }
      }
      
      // Handle export statements
      if (ts.isExportAssignment(statement) && typeName === 'default') {
        const symbol = typeChecker.getSymbolAtLocation(statement.expression);
        if (symbol) {
          return symbol;
        }
      }
    }
    
    return undefined;
  }

  private parseExpression(expression: string, cursorPos: number): ExpressionContext {
    // Simple expression parsing to understand context
    const beforeCursor = expression.substring(0, cursorPos);
    const parts = beforeCursor.split('.');
    
    console.log(`[TypeScriptService] parseExpression: "${expression}", cursorPos: ${cursorPos}`);
    console.log(`[TypeScriptService] beforeCursor: "${beforeCursor}"`);
    console.log(`[TypeScriptService] parts: ${JSON.stringify(parts)}`);
    
    const context = {
      path: parts.slice(0, -1), // All parts except the last (incomplete) one
      currentPart: parts[parts.length - 1] || '',
      isMethodCall: beforeCursor.includes('('),
      isPropertyAccess: beforeCursor.includes('.')
    };
    
    console.log(`[TypeScriptService] context: ${JSON.stringify(context)}`);
    return context;
  }

  private getCompletionsFromType(
    program: ts.Program,
    typeSymbol: ts.Symbol,
    context: ExpressionContext,
    scopeVars: Record<string, any> = {}
  ): CompletionItem[] {
    const typeChecker = program.getTypeChecker();
    console.log(`[TypeScriptService] typeSymbol.name: ${typeSymbol.getName()}`);
    console.log(`[TypeScriptService] typeSymbol.flags: ${typeSymbol.flags}`);
    console.log(`[TypeScriptService] typeSymbol.valueDeclaration: ${typeSymbol.valueDeclaration?.kind}`);
    console.log(`[TypeScriptService] typeSymbol.declarations: ${typeSymbol.declarations?.length}`);
    
    // For interfaces, use getDeclaredTypeOfSymbol instead of getTypeOfSymbolAtLocation
    let actualType: ts.Type;
    if (typeSymbol.flags & ts.SymbolFlags.Interface) {
      console.log(`[TypeScriptService] This is an interface, using getDeclaredTypeOfSymbol`);
      actualType = typeChecker.getDeclaredTypeOfSymbol(typeSymbol);
    } else if (typeSymbol.valueDeclaration) {
      console.log(`[TypeScriptService] Using getTypeOfSymbolAtLocation with valueDeclaration`);
      actualType = typeChecker.getTypeOfSymbolAtLocation(typeSymbol, typeSymbol.valueDeclaration);
    } else if (typeSymbol.declarations && typeSymbol.declarations.length > 0) {
      console.log(`[TypeScriptService] Using getTypeOfSymbolAtLocation with first declaration`);
      actualType = typeChecker.getTypeOfSymbolAtLocation(typeSymbol, typeSymbol.declarations[0]);
    } else {
      console.log(`[TypeScriptService] No declaration found, using getDeclaredTypeOfSymbol as fallback`);
      actualType = typeChecker.getDeclaredTypeOfSymbol(typeSymbol);
    }
    
    return this.completionsFromRootType(program, actualType, context, scopeVars);
  }

  private completionsFromRootType(
    program: ts.Program,
    actualType: ts.Type,
    context: ExpressionContext,
    scopeVars: Record<string, any> = {},
  ): CompletionItem[] {
    const typeChecker = program.getTypeChecker();

    // Navigate through the property path
    let currentType = actualType;
    for (const part of context.path) {
      console.log(`[TypeScriptService] Looking for property "${part}" in type ${typeChecker.typeToString(currentType)}`);
      
      // Check if this part is a scope variable first
      if (part in scopeVars) {
        console.log(`[TypeScriptService] "${part}" is a scope variable: ${JSON.stringify(scopeVars[part])}`);
        
        // For loop variables, we need to find the array type and get its element type
        if (scopeVars[part].type === 'array item') {
          // Find the array property in the current type
          // The scope variable documentation contains the source array name
          const match = scopeVars[part].documentation?.match(/from vln-loop:\w+="([^"]+)"/);
          if (match) {
            const arrayExpr = match[1]; // e.g., "users"
            console.log(`[TypeScriptService] Looking for array property "${arrayExpr}" in root type`);
            
            const arrayProp = actualType.getProperty(arrayExpr);
            if (arrayProp) {
              const arrayType = typeChecker.getTypeOfSymbolAtLocation(arrayProp, arrayProp.valueDeclaration!);
              console.log(`[TypeScriptService] Array type: ${typeChecker.typeToString(arrayType)}`);
              
              // Get the element type of the array
              const arrayElementType = typeChecker.getIndexTypeOfType(arrayType, ts.IndexKind.Number);
              if (arrayElementType) {
                currentType = arrayElementType;
                console.log(`[TypeScriptService] Array element type: ${typeChecker.typeToString(currentType)}`);
              } else {
                console.log(`[TypeScriptService] Could not get array element type, trying type arguments`);
                // Fallback: try to access type arguments directly
                const typeArgs = (arrayType as any).typeArguments;
                if (typeArgs && typeArgs.length > 0) {
                  currentType = typeArgs[0];
                  console.log(`[TypeScriptService] Array element type (from typeArgs): ${typeChecker.typeToString(currentType)}`);
                } else {
                  console.log(`[TypeScriptService] No array element type found`);
                  return [];
                }
              }
            } else {
              console.log(`[TypeScriptService] Array property "${arrayExpr}" not found in root type`);
              return [];
            }
          } else {
            console.log(`[TypeScriptService] Could not extract array expression from scope variable`);
            return [];
          }
        }
        continue;
      }
      
      // Regular property navigation
      const property = currentType.getProperty(part);
      if (!property) {
        console.log(`[TypeScriptService] Property "${part}" not found`);
        const allProps = typeChecker.getPropertiesOfType(currentType).map(p => p.getName());
        console.log(`[TypeScriptService] Available properties: ${allProps.join(', ')}`);
        return [];
      }
      currentType = typeChecker.getTypeOfSymbolAtLocation(property, property.valueDeclaration!);
      console.log(`[TypeScriptService] Navigated to type: ${typeChecker.typeToString(currentType)}`);
    }

    // Get all properties/methods of the current type
    const completions: CompletionItem[] = [];
    
    // Add scope variables if we're at the root level (no navigation path)
    if (context.path.length === 0) {
      for (const [varName, varInfo] of Object.entries(scopeVars)) {
        if (!context.currentPart || varName.startsWith(context.currentPart)) {
          completions.push({
            label: varName,
            kind: CompletionItemKind.Variable,
            detail: varInfo.detail || `${varName}: ${varInfo.type || 'any'}`,
            documentation: varInfo.documentation,
            insertText: varName
          });
        }
      }
    }
    
    const properties = typeChecker.getPropertiesOfType(currentType);
    
    console.log(`[TypeScriptService] Found ${properties.length} properties in current type, ${Object.keys(scopeVars).length} scope vars`);
    
    for (const prop of properties) {
      const propName = prop.getName();
      if (!context.currentPart || propName.startsWith(context.currentPart)) {
        const propType = typeChecker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration!);
        const signatures = typeChecker.getSignaturesOfType(propType, ts.SignatureKind.Call);
        
        const isMethod = signatures.length > 0;
        const kind = isMethod ? CompletionItemKind.Method : CompletionItemKind.Property;
        
        let detail = propName;
        if (isMethod && signatures[0]) {
          detail += typeChecker.signatureToString(signatures[0]);
        } else {
          detail += ': ' + typeChecker.typeToString(propType);
        }

        completions.push({
          label: propName,
          kind,
          detail,
          documentation: this.getSymbolDocumentation(typeChecker, prop),
          insertText: isMethod ? `${propName}()` : propName
        });
      }
    }

    return completions;
  }

  private getSymbolDocumentation(typeChecker: ts.TypeChecker, symbol: ts.Symbol): string | undefined {
    const displayParts = symbol.getDocumentationComment(typeChecker);
    if (displayParts.length === 0) {
      return undefined;
    }
    return ts.displayPartsToString(displayParts);
  }

  /**
   * Compile a <script>'s contents and locate the state expression to use as
   * the root type. Handles two flavours:
   *
   * - inline: schemaRef.source is the script body. We inject a synthetic file
   *   with a `declare const Velin` prelude so `Velin.bind(...)` parses.
   * - linked: schemaRef.linkedPath is a src attribute value; we resolve it
   *   against the HTML document and compile the referenced file directly.
   *
   * In both cases, once we have a program we scan for `Velin.bind(el, state)`
   * and read the type of the second argument. Falls back to the first
   * top-level object literal.
   */
  private compileInlineScript(
    documentUri: string,
    schemaRef: VelinSchemaReference,
  ): { program: ts.Program; rootType: ts.Type } | null {
    const linked = schemaRef.linkedPath
      ? this.resolveLinkedScript(documentUri, schemaRef.linkedPath)
      : null;

    const filename = linked?.absPath ?? INLINE_SCRIPT_FILENAME;
    const scriptBody = linked?.body ?? schemaRef.source ?? '';
    const cacheKey = `inline:${filename}:${hashString(scriptBody)}`;
    if (this.programs.has(cacheKey)) {
      const program = this.programs.get(cacheKey)!;
      const sf = program.getSourceFile(filename);
      if (sf) {
        const rootType = findInlineRootType(program, sf);
        if (rootType) return { program, rootType };
      }
    }

    const options: ts.CompilerOptions = {
      allowJs: true,
      checkJs: false,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      noLib: false,
      skipLibCheck: true,
      strict: false,
    };

    // For inline scripts, prepend a `declare const Velin` prelude so
    // `Velin.bind(...)` parses even without the runtime. Linked files are
    // real modules and can import their own types — no prelude needed.
    const prelude = linked
      ? ''
      : `declare const Velin: { bind(el: unknown, state: any): unknown };\n`;
    const fullSource = prelude + scriptBody;
    const sourceFile = ts.createSourceFile(
      filename,
      fullSource,
      ts.ScriptTarget.ES2020,
      true,
      filename.endsWith('.js') ? ts.ScriptKind.JS : ts.ScriptKind.TS,
    );

    const host = ts.createCompilerHost(options, true);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, langVersion, onErr, shouldCreate) => {
      if (fileName === filename) return sourceFile;
      return originalGetSourceFile(fileName, langVersion, onErr, shouldCreate);
    };
    host.fileExists = (fileName) =>
      fileName === filename || ts.sys.fileExists(fileName);
    host.readFile = (fileName) =>
      fileName === filename ? fullSource : ts.sys.readFile(fileName);

    const program = ts.createProgram([filename], options, host);
    this.programs.set(cacheKey, program);

    const rootType = findInlineRootType(program, sourceFile);
    if (!rootType) return null;
    return { program, rootType };
  }

  /**
   * Resolve a linked script's src against the HTML document's directory and
   * read it from disk. Returns null if the file doesn't exist or is remote
   * (http/https URLs — nothing to inspect statically).
   */
  private resolveLinkedScript(
    documentUri: string,
    src: string,
  ): { absPath: string; body: string } | null {
    if (/^https?:/i.test(src) || src.startsWith('//')) return null;
    try {
      const docPath = URI.parse(documentUri).fsPath;
      const absPath = path.resolve(path.dirname(docPath), src);
      if (!fs.existsSync(absPath)) return null;
      const body = fs.readFileSync(absPath, 'utf8');
      return { absPath, body };
    } catch {
      return null;
    }
  }

  private analyzeScopeAtLine(
    documentUri: string,
    lineNumber: number,
    documentText?: string,
  ): Record<string, any> {
    try {
      // Prefer the LSP-synced document text; fall back to disk when the caller
      // did not provide it (e.g. warm-start requests).
      let content = documentText;
      if (content === undefined) {
        const uri = URI.parse(documentUri);
        const documentPath = uri.fsPath;
        if (!fs.existsSync(documentPath)) return {};
        content = fs.readFileSync(documentPath, 'utf8');
      }
      const lines = content.split('\n');
      const scopeVars: Record<string, any> = {};

      // Search upwards from current line to find enclosing scopes
      let foundScope = false;
      for (let i = lineNumber; i >= 0 && i < lines.length; i--) {
        const line = lines[i];

        // Look for vln-loop:varName patterns
        const loopMatch = line.match(/vln-loop:(\w+)=["']([^"']+)["']/);
        if (loopMatch) {
          const varName = loopMatch[1];
          const arrayExpr = loopMatch[2];
          
          scopeVars[varName] = {
            type: 'array item',
            detail: `${varName} (from ${arrayExpr})`,
            documentation: `Loop variable from vln-loop:${varName}="${arrayExpr}"`
          };
          
          // Add $index for loops
          scopeVars['$index'] = {
            type: 'number',
            detail: '$index: number',
            documentation: 'Current iteration index in vln-loop'
          };
          
          foundScope = true;
        }

        // Look for vln-var:varName patterns (template variables) - only on current or previous lines
        if (i <= lineNumber) {
          const varMatches = line.matchAll(/vln-var:(\w+)=["']([^"']+)["']/g);
          for (const match of varMatches) {
            const varName = match[1];
            const varExpr = match[2];

            scopeVars[varName] = {
              type: 'template variable',
              detail: `${varName} (from ${varExpr})`,
              documentation: `Template variable from vln-var:${varName}="${varExpr}"`
            };
            foundScope = true;
          }
        }

        // Stop searching if we hit a closing tag that ends current scope,
        // but continue if we haven't found any scope yet (to catch parent scopes)
        if (foundScope && line.includes('</') && !line.includes('<!--')) {
          break;
        }
      }
      
      return scopeVars;
    } catch (error: any) {
      return {};
    }
  }
}

interface ExpressionContext {
  path: string[];
  currentPart: string;
  isMethodCall: boolean;
  isPropertyAccess: boolean;
}

export type Hop =
  | { kind: 'prop'; name: string }
  | { kind: 'call' }
  | { kind: 'index' };

const INLINE_SCRIPT_FILENAME = '__velin_inline__.ts';

function hashString(s: string): string {
  // Cheap 32-bit FNV-1a — good enough for a cache key.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

function elementTypeOfProperty(
  checker: ts.TypeChecker,
  parentType: ts.Type,
  propName: string,
): ts.Type | undefined {
  const arrayProp = parentType.getProperty(propName);
  if (!arrayProp?.valueDeclaration) return undefined;
  const arrayType = checker.getTypeOfSymbolAtLocation(
    arrayProp,
    arrayProp.valueDeclaration,
  );
  return (
    checker.getIndexTypeOfType(arrayType, ts.IndexKind.Number) ??
    (arrayType as any).typeArguments?.[0]
  );
}

function locationOfDecl(
  decl: ts.Declaration,
  schemaRef: VelinSchemaReference,
  htmlContext?: { uri: string; text?: string },
): DefinitionLocation | null {
  const sf = decl.getSourceFile();

  // For inline-script schemas, `decl` lives in a synthetic file whose contents
  // are prelude + scriptBody. Translate positions back to the HTML document.
  if (
    schemaRef.type === 'inline-script' &&
    schemaRef.sourceOffset !== undefined &&
    sf.fileName === INLINE_SCRIPT_FILENAME &&
    htmlContext
  ) {
    const preludeLen = sf.text.length - (schemaRef.source?.length ?? 0);
    const declStart = decl.getStart();
    const declEnd = decl.getEnd();
    if (declStart < preludeLen) return null; // decl is inside the injected prelude
    const htmlStart = schemaRef.sourceOffset + (declStart - preludeLen);
    const htmlEnd = schemaRef.sourceOffset + (declEnd - preludeLen);

    const text = htmlContext.text ?? readFileOrEmpty(htmlContext.uri);
    if (!text) return null;
    return {
      uri: htmlContext.uri,
      range: {
        start: offsetToLineCol(text, htmlStart),
        end: offsetToLineCol(text, htmlEnd),
      },
    };
  }

  const start = sf.getLineAndCharacterOfPosition(decl.getStart());
  const end = sf.getLineAndCharacterOfPosition(decl.getEnd());
  return {
    uri: URI.file(sf.fileName).toString(),
    range: {
      start: { line: start.line, character: start.character },
      end: { line: end.line, character: end.character },
    },
  };
}

function readFileOrEmpty(uri: string): string {
  try {
    return fs.readFileSync(URI.parse(uri).fsPath, 'utf8');
  } catch {
    return '';
  }
}

function offsetToLineCol(text: string, offset: number): { line: number; character: number } {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

function findInlineRootType(program: ts.Program, sf: ts.SourceFile): ts.Type | undefined {
  const checker = program.getTypeChecker();
  // Prefer Velin.bind(el, STATE) — the state argument is authoritative.
  let bindStateNode: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (
      !bindStateNode &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'Velin' &&
      node.expression.name.text === 'bind' &&
      node.arguments.length >= 2
    ) {
      bindStateNode = node.arguments[1];
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (bindStateNode) {
    return checker.getTypeAtLocation(bindStateNode);
  }

  // Fallback: first top-level `const foo = { ... }` object literal.
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (d.initializer && ts.isObjectLiteralExpression(d.initializer)) {
        return checker.getTypeAtLocation(d.initializer);
      }
    }
  }
  return undefined;
}

/**
 * AST-based expression walk. Given an expression like `getCurrentUser().name`
 * and a cursor position, returns:
 *   { root: 'getCurrentUser', hops: [{kind:'call'}, {kind:'prop', name:'name'}] }
 *
 * The last hop is the F12 target. Supports property access, call expressions,
 * and element access. Returns null if the cursor is not on an identifier.
 */
export function extractHopsAt(
  expression: string,
  cursorPos: number,
): { root: string; hops: Hop[] } | null {
  const sf = ts.createSourceFile(
    '_expr.ts',
    expression,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  // Find the identifier node under the cursor.
  let hit: ts.Identifier | undefined;
  const findAt = (node: ts.Node) => {
    if (hit) return;
    const start = node.getStart(sf);
    const end = node.getEnd();
    if (cursorPos < start || cursorPos > end) return;
    if (ts.isIdentifier(node)) hit = node;
    ts.forEachChild(node, findAt);
  };
  findAt(sf);
  if (!hit) return null;

  // If the identifier is the `.name` of a PropertyAccessExpression, the
  // chain-end node is the PropertyAccessExpression itself. Otherwise it's
  // the identifier alone (the root of some chain — possibly its own chain).
  let chainEnd: ts.Expression = hit;
  if (
    hit.parent &&
    ts.isPropertyAccessExpression(hit.parent) &&
    hit.parent.name === hit
  ) {
    chainEnd = hit.parent;
  }

  return analyzeChain(chainEnd);
}

function analyzeChain(node: ts.Expression): { root: string; hops: Hop[] } | null {
  if (ts.isIdentifier(node)) {
    return { root: node.text, hops: [] };
  }
  if (ts.isPropertyAccessExpression(node)) {
    const inner = analyzeChain(node.expression);
    if (!inner) return null;
    inner.hops.push({ kind: 'prop', name: node.name.text });
    return inner;
  }
  if (ts.isCallExpression(node)) {
    const inner = analyzeChain(node.expression);
    if (!inner) return null;
    inner.hops.push({ kind: 'call' });
    return inner;
  }
  if (ts.isElementAccessExpression(node)) {
    const inner = analyzeChain(node.expression);
    if (!inner) return null;
    inner.hops.push({ kind: 'index' });
    return inner;
  }
  return null;
}

/**
 * Extract the dotted property chain that the cursor is inside. For
 * `user.profile.avatar + 1` with cursor at position 15 (mid-`avatar`),
 * returns `{ path: ['user', 'profile'], target: 'avatar' }`.
 *
 * Returns null if the cursor is not on an identifier.
 */
export function extractPropertyChainAt(
  expression: string,
  cursorPos: number,
): { path: string[]; target: string } | null {
  // Find the identifier span covering the cursor by walking outward.
  const isIdentChar = (c: string) => /[\w$]/.test(c);
  let start = cursorPos;
  while (start > 0 && isIdentChar(expression[start - 1])) start--;
  let end = cursorPos;
  while (end < expression.length && isIdentChar(expression[end])) end++;
  if (start === end) return null;
  const target = expression.substring(start, end);
  if (!/^[A-Za-z_$][\w$]*$/.test(target)) return null;

  // Walk backwards from `start` gathering the `.foo.bar.` chain.
  const path: string[] = [];
  let i = start;
  while (i > 0 && expression[i - 1] === '.') {
    i--;
    let segEnd = i;
    while (i > 0 && isIdentChar(expression[i - 1])) i--;
    if (i === segEnd) break;
    path.unshift(expression.substring(i, segEnd));
  }
  return { path, target };
}