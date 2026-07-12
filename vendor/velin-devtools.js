(()=>{(function(){if(typeof window>"u"||window.__VELIN_DEVTOOLS_COMPANION__)return;let W="0.1.0-alpha.0",b="__VELIN_DEVTOOLS_HOOK__",B=500,G=200,H=400,K=100,X=100,j=40,z=200,L=30;if(new URLSearchParams(location.search).get("velin-devtools")==="off"||typeof localStorage<"u"&&localStorage.getItem("velinDevtools")==="off")return;function U(i){if(window[b])return i(window[b]);let c=!1,p;try{Object.defineProperty(window,b,{configurable:!0,get(){return p},set(x){p=x,c||(c=!0,queueMicrotask(()=>i(x)))}})}catch{}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",g):queueMicrotask(g);function g(){queueMicrotask(()=>{window[b]||console.warn("[Velin devtools] Velin was not built with __DEV__=true; devtools cannot attach.")})}}function J(i){let c=window.Velin;if(!c||typeof c.bind!="function"){console.warn("[Velin devtools] window.Velin not present; cannot boot Velin-driven UI.");return}let p=document.createElement("div");p.style.cssText="position:fixed;z-index:2147483647;bottom:8px;right:8px;";let g=p.attachShadow({mode:"open"});g.innerHTML=Y,document.documentElement.appendChild(p);let x=g.querySelector(".panel"),m=g.querySelector(".body"),C=new WeakMap,Q=0,Z=t=>{let e=C.get(t);return e==null&&(e=++Q,C.set(t,e)),e},h=new Map,w=new Map,y=new Set,d=localStorage.getItem("velinDevtools.open")==="1",k=localStorage.getItem("velinDevtools.hl")==="1",I=0,N=localStorage.getItem("velinDevtools.tab")||"Log",$=["State","Bindings","Log","Effects","Perf","Warnings"],tt={open:d,activeTab:$.includes(N)?N:"Log",highlightOn:k,logFilter:"",logGrouping:!0,TABS:$,LOG_KINDS:["","bind","compose","mutate","trigger","effect","compile","evaluate","plugin","cleanup","warn"],logEntries:[],stateEntries:[],bindingRows:[],effectsRuns:[],perfRows:[],perfStats:{updateCounter:0,updatesDelta:0,effectCount:0,bindingsCount:0,orphanedEffectsSinceStart:0},warningsList:[],setTab(t){this.activeTab=t,localStorage.setItem("velinDevtools.tab",t),_=!0,f({force:!0})},close(){this.open=!1,d=!1,localStorage.setItem("velinDevtools.open","0"),S()},togglePanel(){this.open=!this.open,d=this.open,localStorage.setItem("velinDevtools.open",d?"1":"0"),d?(f({force:!0}),M()):S()},toggleHighlight(){this.highlightOn=!this.highlightOn,k=this.highlightOn,localStorage.setItem("velinDevtools.hl",k?"1":"0")},toggleLogGrouping(){this.logGrouping=!this.logGrouping,f({force:!0})},clearLog(){i.setLogCapacity(i.log.length||500),f({force:!0})},flashBinding(t){let e=h.get(t);if(e)for(let n of e.nodes)O(n)},hoverInState(t){let e=w.get(t);e instanceof Element&&ut(e)},hoverOutState(t){let e=w.get(t);e instanceof Element&&ft(e)},toggleStateRow(t){y.has(t)?y.delete(t):y.add(t),f({force:!0})},flashEffect(t){let e=h.get(t);if(e)for(let n of e.nodes)O(n)}},u=c.bind(x,tt),et=c.\u00F8__internal.getWrapper(u);i.\u00F8__ignoreState(et);let v=null,R=-1,F=null;function M(){v==null&&(v=setInterval(()=>{d&&f()},B))}function S(){v!=null&&(clearInterval(v),v=null)}let _=!0;m&&m.addEventListener("scroll",()=>{_=m.scrollTop<=2},{passive:!0});function f({force:t=!1}={}){if(!d)return;let e=i.emitSeq,n=u.activeTab;if(!t&&e===R&&n===F)return;R=e,F=n,i.refreshStats();let s=performance.now(),o;switch(n){case"Log":o={logEntries:nt()};break;case"State":o={stateEntries:st()};break;case"Bindings":o={bindingRows:at()};break;case"Effects":o={effectsRuns:it()};break;case"Perf":{let r=i.stats.updateCounter;o={perfRows:lt(),perfStats:{updateCounter:r,updatesDelta:r-I,effectCount:i.stats.effectCount,bindingsCount:i.stats.bindingsCount,orphanedEffectsSinceStart:i.stats.orphanedEffectsSinceStart}},I=r;break}case"Warnings":o={warningsList:ot()};break;default:return}c.getController(u).batch(()=>{for(let r in o)u[r]=o[r]});let l=performance.now()-s;l>L&&console.warn(`[Velin devtools] ${n} snapshot took ${l.toFixed(1)}ms (budget ${L}ms).`),n==="Log"&&_&&m&&requestAnimationFrame(()=>{m.scrollTop=0})}let E=new Set,T=!1;i.subscribe(t=>{if(!k||t.kind!=="effect")return;let e=t.node;!e||!document.contains(e)||(E.add(e),T||(T=!0,requestAnimationFrame(()=>{for(let n of E)O(n);E.clear(),T=!1})))}),document.addEventListener("keydown",t=>{t.ctrlKey&&t.shiftKey&&(t.key==="V"||t.key==="v")&&u.togglePanel()}),d&&(f({force:!0}),M());function nt(){let t=i.log,e=u.logFilter,n=u.logGrouping,s=[];for(let o=t.length-1;o>=0&&s.length<G;o--){let a=t[o];if(!(e&&a.kind!==e)){if(n&&s.length>0){let l=s[s.length-1];if(l.kind===a.kind&&l._groupKey===P(a)){l.count++,l.earliestT=a.t;continue}}s.push({id:a.\u00F8__seq,kind:a.kind,summary:rt(a),raw:pt(a),t:a.t,earliestT:a.t,count:1,_groupKey:P(a)})}}for(let o=0;o<s.length;o++){let a=s[o+1];s[o].tRel=a?ct(s[o].earliestT-a.earliestT):dt(s[o].earliestT),s[o].summaryDisplay=s[o].count>1?`${s[o].summary}  \xD7${s[o].count}`:s[o].summary}return s}function P(t){switch(t.kind){case"mutate":case"trigger":case"effect":return t.path||"";case"evaluate":case"compile":return t.expr||"";case"warn":return t.code||"";case"plugin":return t.name+"@"+(t.phase||"");default:return""}}function ot(){let t=new Map,e=i.log;for(let s=e.length-1;s>=0;s--){let o=e[s];if(o.kind!=="warn")continue;let a=o.ref?o.ref.path||o.ref.expr||JSON.stringify(o.ref):o.message,l=o.code+"::"+a,r=t.get(l);if(!r){if(t.size>=z)continue;r={id:l,code:o.code,sample:o.message,count:0,lastT:o.t},t.set(l,r)}r.count++,o.t>r.lastT&&(r.lastT=o.t)}let n=i.\u00F8__now();return[...t.values()].sort((s,o)=>o.lastT-s.lastT).map(s=>({id:s.id,code:s.code,sample:s.sample,count:s.count,lastAgo:D(n-s.lastT)}))}function st(){w.clear();let t=[],e=(n,s,o)=>{if(t.length>=H)return;let a=Z(n),l=i.nodeFor(n),r=n.\u00F8__innerStates?[...n.\u00F8__innerStates]:[];w.set(a,l);let q=y.has(a);if(t.push({id:a,parentId:o,label:l?A(l):"state "+a,indent:s,innersCount:r.length,hasNode:!!l,hasTricklingRoots:!!(n.tricklingRoots&&n.tricklingRoots.length),collapsed:q}),!q)for(let gt of r)e(gt,s+1,a)};for(let n of i.states)i.parentOf(n)||e(n,0,0);return t}function at(){return h.clear(),i.topBindings(K).map(e=>{let n=e.stateIdx+"@"+e.path;return h.set(n,{nodes:e.nodes}),{id:n,path:e.path,effectCount:e.effectCount,sampleExpr:e.sampleExpr||"-",nodesCount:e.nodes.length}})}function it(){h.clear();let t=i.log,e=i.\u00F8__now(),n=[];for(let s=t.length-1;s>=0&&n.length<X;s--){let o=t[s];if(o.kind!=="effect")continue;let a=o.\u00F8__seq;o.node&&h.set(a,{nodes:[o.node]}),n.push({id:a,path:o.path||"-",expr:o.expr||"-",nodeLabel:o.node?A(o.node):"-",plugin:o.pluginName||"-",durationMs:typeof o.durationMs=="number"?+o.durationMs.toFixed(2):0,ago:D(e-o.t)})}return n}function lt(){return[...i.stats.expressionEvalTime.entries()].map(([t,e])=>({id:t,expr:t,calls:e.calls,totalMs:+e.totalMs.toFixed(2),avg:+(e.totalMs/e.calls).toFixed(3),maxMs:+(e.maxMs??0).toFixed(2)})).sort((t,e)=>e.totalMs-t.totalMs).slice(0,j)}function rt(t){switch(t.kind){case"bind":return t.rootNode?`<${(t.rootNode.nodeName||"node").toLowerCase()}>`:"";case"compose":return"substate";case"cleanup":return t.node?`<${(t.node.nodeName||"node").toLowerCase()}>`:"state";case"mutate":return`${t.path} (${t.op}${t.method?" "+t.method:""})`;case"trigger":return`${t.path} \u2192 ${t.effectCount??0}${t.queued?" [q]":""}`;case"effect":return`${t.path||"-"} ${t.pluginName||""} ${V(t.durationMs)}`;case"evaluate":return`${t.expr||"-"} ${V(t.durationMs)}${t.ok?"":" ERR"}`;case"compile":return t.expr||"";case"plugin":return`${t.name} ${t.phase}${t.expr?" "+t.expr:""}`;case"warn":return`[${t.code}] ${t.message}`;default:return""}}function V(t){return typeof t=="number"?t.toFixed(2)+"ms":""}function ct(t){return(!Number.isFinite(t)||t<0)&&(t=0),t<1?"+0ms":t<1e3?`+${t.toFixed(0)}ms`:t<6e4?`+${(t/1e3).toFixed(1)}s`:`+${(t/6e4).toFixed(1)}m`}function dt(t){let e=new Date(performance.timeOrigin+t),n=String(e.getHours()).padStart(2,"0"),s=String(e.getMinutes()).padStart(2,"0"),o=String(e.getSeconds()).padStart(2,"0");return`${n}:${s}:${o}`}function D(t){return!Number.isFinite(t)||t<0?"just now":t<1e3?`${t.toFixed(0)}ms ago`:t<6e4?`${(t/1e3).toFixed(1)}s ago`:`${(t/6e4).toFixed(1)}m ago`}function pt(t){let e={};for(let n of Object.keys(t)){if(n==="\xF8__seq")continue;let s=t[n];s==null||typeof s!="object"?e[n]=s:s instanceof Node?e[n]="<"+(s.nodeName||"node")+">":n==="state"||n==="parent"||n==="child"?e[n]="<ReactiveState>":Array.isArray(s)?e[n]=`[\u2026${s.length}]`:e[n]="{\u2026}"}try{return JSON.stringify(e,null,2)}catch{return String(t)}}function A(t){if(!t||t.nodeType!==1)return"?";let e=[],n=t;for(;n&&n.nodeType===1&&n!==document.documentElement&&e.length<6;){let s=n.tagName.toLowerCase();if(n.id){s+="#"+n.id,e.unshift(s);break}if(n.classList&&n.classList.length&&(s+="."+n.classList[0]),n.parentElement){let o=[...n.parentElement.children].filter(a=>a.tagName===n.tagName);o.length>1&&(s+="["+(o.indexOf(n)+1)+"]")}e.unshift(s),n=n.parentElement}return e.join("/")}function O(t){if(!(t instanceof Element))return;let e=t.style.outline,n=t.style.transition;t.style.transition="outline 0.4s",t.style.outline="2px solid #7cf",setTimeout(()=>{t.style.outline=e,t.style.transition=n},400)}function ut(t){t.dataset.velinPrevOutline=t.style.outline||"",t.dataset.velinPrevOffset=t.style.outlineOffset||"",t.style.outline="2px solid #7cf",t.style.outlineOffset="-2px"}function ft(t){t.style.outline=t.dataset.velinPrevOutline||"",t.style.outlineOffset=t.dataset.velinPrevOffset||"",delete t.dataset.velinPrevOutline,delete t.dataset.velinPrevOffset}window.__VELIN_DEVTOOLS_COMPANION__={version:W,dispose(){S(),p.remove(),delete window.__VELIN_DEVTOOLS_COMPANION__}}}let Y=`
    <style>
      :host { all: initial; }
      .panel { font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace; color: #ddd;
               background: #111a; backdrop-filter: blur(8px); border: 1px solid #444;
               border-radius: 6px; width: 600px; height: 400px; display: none;
               resize: both; overflow: hidden; box-shadow: 0 6px 24px #000a; }
      .panel.open { display: flex; flex-direction: column; }
      header { display: flex; align-items: center; gap: 6px; padding: 4px 8px;
               background: #222; border-bottom: 1px solid #333; user-select: none; }
      header .title { font-weight: bold; color: #7cf; margin-right: auto; }
      header button, header label { font: inherit; color: #ddd; background: #333;
               border: 1px solid #555; border-radius: 3px; padding: 2px 6px; cursor: pointer; }
      header input[type=checkbox] { vertical-align: middle; margin-right: 3px; }
      .tabs { display: flex; gap: 2px; padding: 4px 8px 0; background: #1a1a1a; }
      .tabs button { font: inherit; background: transparent; color: #999; border: 0;
                     border-bottom: 2px solid transparent; padding: 4px 8px; cursor: pointer; }
      .tabs button.active { color: #7cf; border-bottom-color: #7cf; }
      .body { flex: 1; overflow: auto; padding: 6px 8px; }
      .row { padding: 2px 0; border-bottom: 1px dotted #333; }
      .row.click { cursor: pointer; }
      .row.click:hover { background: #222; }
      .k { color: #7cf; }
      .v { color: #eda; }
      .dim { color: #888; }
      .warn { color: #fa7; }
      .err { color: #f66; }
      details { margin-left: 8px; }
      summary { cursor: pointer; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 2px 6px; border-bottom: 1px solid #333;
               vertical-align: top; }
      th { color: #7cf; position: sticky; top: 0; background: #1a1a1a; }
      td.num { text-align: right; font-variant-numeric: tabular-nums; }
      input[type=text], select { background: #222; color: #ddd; border: 1px solid #444;
                                 border-radius: 3px; padding: 2px 4px; font: inherit; }
      .state-row { padding: 2px 0; border-bottom: 1px dotted #333; cursor: pointer;
                   display: flex; align-items: center; gap: 6px; }
      .state-row:hover { background: #222; }
      .caret { display: inline-block; width: 10px; color: #888; }
      .badge { display: inline-block; padding: 0 4px; border-radius: 3px;
               font-size: 10px; line-height: 14px; background: #223; color: #7cf; }
      .badge.trickle { background: #331; color: #eda; }
      .badge.count { background: #333; color: #eda; }
      .log-row { display: grid; grid-template-columns: 60px 60px 1fr; gap: 6px;
                 padding: 2px 0; border-bottom: 1px dotted #333; align-items: baseline; }
      .log-row .t { color: #888; font-variant-numeric: tabular-nums; }
      .log-row .kind { display: inline-block; padding: 0 4px; border-radius: 3px;
                       font-size: 10px; text-transform: uppercase; text-align: center; }
      .log-row .summ { color: #eda; overflow: hidden; text-overflow: ellipsis;
                       white-space: nowrap; }
      /* Per-kind colors */
      .kind.mutate   { background: #244; color: #9df; }
      .kind.trigger  { background: #232; color: #ad9; }
      .kind.effect   { background: #422; color: #fa9; }
      .kind.evaluate { background: #443; color: #eda; }
      .kind.compile  { background: #334; color: #ccf; }
      .kind.plugin   { background: #333; color: #ccc; }
      .kind.bind     { background: #224; color: #7cf; }
      .kind.compose  { background: #234; color: #9cf; }
      .kind.cleanup  { background: #322; color: #d99; }
      .kind.warn     { background: #430; color: #fa7; }
      .log-row details { margin: 0; grid-column: 1 / -1; }
      .log-row pre { margin: 4px 0 4px 66px; padding: 4px 6px; background: #0a0a0a;
                     border-left: 2px solid #333; color: #aaa; overflow: auto;
                     max-height: 200px; }
      .empty { color: #888; padding: 12px; text-align: center; }
      .churn { color: #eda; font-weight: bold; }
    </style>
    <div class="panel" vln-attr:class="'panel ' + (open ? 'open' : '')">
      <header>
        <span class="title">Velin devtools</span>
        <label>
          <input type="checkbox" vln-attr:checked="highlightOn" vln-on:change="toggleHighlight()">
          highlight
        </label>
        <button vln-on:click="clearLog()" title="Clear log">clear</button>
        <button vln-on:click="close()" title="Close (Ctrl+Shift+V)">\xD7</button>
      </header>
      <div class="tabs">
        <button vln-loop:t="TABS"
                vln-attr:class="activeTab === t ? 'active' : ''"
                vln-on:click="setTab(t)"
                vln-text="t"></button>
      </div>
      <div class="body">

        <div vln-if="activeTab === 'State'">
          <div vln-if="stateEntries.length === 0" class="empty">no bound states</div>
          <div vln-loop:s="{collection: stateEntries, key: 'id'}"
               class="state-row"
               vln-attr:style="'padding-left:' + (s.indent * 14 + 4) + 'px'"
               vln-on:click="toggleStateRow(s.id)"
               vln-on:mouseenter="hoverInState(s.id)"
               vln-on:mouseleave="hoverOutState(s.id)">
            <span class="caret"
                  vln-text="s.innersCount > 0 ? (s.collapsed ? '\u25B6' : '\u25BC') : ''"></span>
            <span class="k" vln-text="s.label"></span>
            <span vln-if="s.innersCount > 0" class="badge count"
                  vln-text="s.innersCount"></span>
            <span vln-if="s.hasTricklingRoots" class="badge trickle" title="anchored state">\u2193</span>
          </div>
        </div>

        <div vln-if="activeTab === 'Bindings'">
          <div vln-if="bindingRows.length === 0" class="empty">no bindings</div>
          <table vln-if="bindingRows.length > 0">
            <tr>
              <th>Path</th><th>#Effects</th><th>Sample expr</th><th>Nodes</th>
            </tr>
            <tr vln-loop:b="{collection: bindingRows, key: 'id'}"
                class="row click"
                vln-on:click="flashBinding(b.id)">
              <td vln-text="b.path"></td>
              <td class="num" vln-text="b.effectCount"></td>
              <td vln-text="b.sampleExpr"></td>
              <td class="num" vln-text="b.nodesCount"></td>
            </tr>
          </table>
        </div>

        <div vln-if="activeTab === 'Log'">
          <div class="row" style="display:flex; gap:8px; align-items:center;">
            <span>Filter</span>
            <select vln-input="logFilter">
              <option vln-loop:k="LOG_KINDS" vln-attr:value="k" vln-text="k || 'all'"></option>
            </select>
            <label>
              <input type="checkbox" vln-attr:checked="logGrouping"
                     vln-on:change="toggleLogGrouping()">
              group bursts
            </label>
          </div>
          <div vln-if="logEntries.length === 0" class="empty">no log entries</div>
          <details vln-loop:ev="{collection: logEntries, key: 'id'}" class="log-row">
            <summary>
              <span class="t" vln-text="ev.tRel"></span>
              <span vln-attr:class="'kind ' + ev.kind" vln-text="ev.kind"></span>
              <span class="summ" vln-text="ev.summaryDisplay"></span>
            </summary>
            <pre vln-text="ev.raw"></pre>
          </details>
        </div>

        <div vln-if="activeTab === 'Effects'">
          <div vln-if="effectsRuns.length === 0" class="empty">no effects have run recently</div>
          <table vln-if="effectsRuns.length > 0">
            <tr>
              <th>When</th><th>Path</th><th>Expr</th><th>Plugin</th><th>Node</th><th>ms</th>
            </tr>
            <tr vln-loop:r="{collection: effectsRuns, key: 'id'}"
                class="row click"
                vln-on:click="flashEffect(r.id)">
              <td class="dim" vln-text="r.ago"></td>
              <td vln-text="r.path"></td>
              <td vln-text="r.expr"></td>
              <td class="dim" vln-text="r.plugin"></td>
              <td class="dim" vln-text="r.nodeLabel"></td>
              <td class="num" vln-text="r.durationMs"></td>
            </tr>
          </table>
        </div>

        <div vln-if="activeTab === 'Perf'">
          <div class="dim" style="margin-bottom:6px;">
            updates: <span class="churn" vln-text="perfStats.updateCounter"></span>
            (<span class="churn" vln-text="'+' + perfStats.updatesDelta"></span>/tick)
             | effects: <span vln-text="perfStats.effectCount"></span>
             | bindings: <span vln-text="perfStats.bindingsCount"></span>
             | orphaned: <span vln-text="perfStats.orphanedEffectsSinceStart"></span>
          </div>
          <div vln-if="perfRows.length === 0" class="empty">no expressions evaluated yet</div>
          <table vln-if="perfRows.length > 0">
            <tr>
              <th>Expression</th><th>Calls</th><th>Total ms</th><th>Avg ms</th><th>Max ms</th>
            </tr>
            <tr vln-loop:r="{collection: perfRows, key: 'id'}" class="row">
              <td vln-text="r.expr"></td>
              <td class="num" vln-text="r.calls"></td>
              <td class="num" vln-text="r.totalMs"></td>
              <td class="num" vln-text="r.avg"></td>
              <td class="num" vln-text="r.maxMs"></td>
            </tr>
          </table>
        </div>

        <div vln-if="activeTab === 'Warnings'">
          <div vln-if="warningsList.length === 0" class="empty">no warnings</div>
          <table vln-if="warningsList.length > 0">
            <tr>
              <th>Code</th><th>Sample</th><th>Count</th><th>Last</th>
            </tr>
            <tr vln-loop:w="{collection: warningsList, key: 'id'}" class="row warn">
              <td vln-text="w.code"></td>
              <td vln-text="w.sample"></td>
              <td class="num" vln-text="w.count"></td>
              <td class="dim" vln-text="w.lastAgo"></td>
            </tr>
          </table>
        </div>

      </div>
    </div>
  `;U(J)})();})();
//# sourceMappingURL=velin-devtools.min.js.map
