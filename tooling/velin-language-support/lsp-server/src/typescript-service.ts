import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { URI } from 'vscode-uri';
import { CompletionItem, CompletionItemKind, VelinSchemaReference } from '@velin/shared';

export class TypeScriptService {
  private programs: Map<string, ts.Program> = new Map();
  
  async getCompletions(
    schemaRef: VelinSchemaReference,
    expression: string,
    cursorPos: number,
    documentUri: string,
    currentLine?: number
  ): Promise<CompletionItem[]> {
    if (schemaRef.type === 'global-type') {
      return this.getGlobalTypeCompletions(schemaRef, expression, cursorPos, documentUri, currentLine);
    }

    try {
      const uri = URI.parse(documentUri);
      const documentPath = uri.fsPath;
      
      // Resolve schema path relative to the document
      if (!schemaRef.source) return [];
      const schemaFilePath = path.resolve(path.dirname(documentPath), schemaRef.source);
      
      if (!fs.existsSync(schemaFilePath)) {
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
      const scopeVars = currentLine !== undefined ? this.analyzeScopeAtLine(documentUri, currentLine) : {};
      
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
    currentLine?: number
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
      const scopeVars = currentLine !== undefined ? this.analyzeScopeAtLine(documentUri, currentLine) : {};
      
      return this.getCompletionsFromType(program, typeSymbol, expressionContext, scopeVars);
    } catch (error: any) {
      console.log(`[TypeScriptService] ERROR in getGlobalTypeCompletions: ${error.message}`);
      return [];
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
    
    console.log(`[TypeScriptService] Starting with type: ${typeChecker.typeToString(actualType)}`);
    console.log(`[TypeScriptService] Type flags: ${actualType.flags}`);
    console.log(`[TypeScriptService] Type symbol: ${actualType.symbol?.getName()}`);
    
    console.log(`[TypeScriptService] Navigation path: ${JSON.stringify(context.path)}`);
    
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

  private analyzeScopeAtLine(documentUri: string, lineNumber: number): Record<string, any> {
    try {
      const uri = URI.parse(documentUri);
      const documentPath = uri.fsPath;
      const fs = require('fs');
      
      if (!fs.existsSync(documentPath)) {
        return {};
      }

      const content = fs.readFileSync(documentPath, 'utf8');
      const lines = content.split('\n');
      const scopeVars: Record<string, any> = {};

      // Analyze lines from current position upwards to find scope-defining directives
      console.log(`[TypeScriptService] Analyzing scope from line ${lineNumber} (0-based)`);
      
      // Search upwards from current line to find enclosing scopes
      let foundScope = false;
      for (let i = lineNumber; i >= 0 && i < lines.length; i--) {
        const line = lines[i];
        console.log(`[TypeScriptService] Checking line ${i}: "${line.trim()}"`);
        
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
          
          console.log(`[TypeScriptService] Found loop scope: ${varName} from ${arrayExpr}`);
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
            
            console.log(`[TypeScriptService] Found template var: ${varName} from ${varExpr}`);
            foundScope = true;
          }
        }
        
        // Stop searching if we hit a closing tag that ends current scope, 
        // but continue if we haven't found any scope yet (to catch parent scopes)
        if (foundScope && line.includes('</') && !line.includes('<!--')) {
          console.log(`[TypeScriptService] Found closing tag, stopping scope search`);
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