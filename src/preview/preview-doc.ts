// What the preview iframe shows: the generated page plus a small guard script.
// The iframe is sandboxed without allow-same-origin, so the page runs with an opaque
// origin. That keeps it away from the app and the key, but it also breaks things that
// work once the file is downloaded: storage and cookies throw, and links or forms
// navigate the frame to a blank page. The guard papers over that inside the preview
// only; downloads keep the original HTML.

/** Tag on every message the guard posts to the app. */
export const PREVIEW_MESSAGE_SOURCE = 'html-creator-preview';

/** Longest script error the guard sends; the notice shows one line anyway. */
export const MAX_PREVIEW_ERROR_CHARS = 300;

// ES5 on purpose and every piece in its own try/catch: it runs before the page's own
// code and must never be the reason a page fails.
const GUARD_SOURCE = `(function(){
var w=window,d=document,SRC=${JSON.stringify(PREVIEW_MESSAGE_SOURCE)},MAX=${MAX_PREVIEW_ERROR_CHARS},sent=0;
function memoryStorage(){
var data={};
function has(k){return Object.prototype.hasOwnProperty.call(data,k);}
var s={
getItem:function(k){k=String(k);return has(k)?data[k]:null;},
setItem:function(k,v){data[String(k)]=String(v);},
removeItem:function(k){delete data[String(k)];},
clear:function(){data={};},
key:function(i){var keys=Object.keys(data);i=Number(i);return i>=0&&i<keys.length?keys[i]:null;}
};
Object.defineProperty(s,'length',{get:function(){return Object.keys(data).length;}});
return s;
}
function guardStorage(name){
try{w[name];}catch(e){
try{Object.defineProperty(w,name,{configurable:true,enumerable:true,value:memoryStorage()});}catch(e2){}
}
}
guardStorage('localStorage');
guardStorage('sessionStorage');
try{d.cookie;}catch(e){
try{
var jar={};
Object.defineProperty(d,'cookie',{configurable:true,enumerable:true,
get:function(){var out=[];for(var k in jar){if(Object.prototype.hasOwnProperty.call(jar,k))out.push(k+'='+jar[k]);}return out.join('; ');},
set:function(v){
var parts=String(v).split(';'),pair=parts[0],eq=pair.indexOf('=');
var name=(eq<0?'':pair.slice(0,eq)).replace(/^\\s+|\\s+$/g,''),value=(eq<0?pair:pair.slice(eq+1)).replace(/^\\s+|\\s+$/g,'');
var gone=false;
for(var i=1;i<parts.length;i++){
var attr=parts[i].replace(/^\\s+|\\s+$/g,'').toLowerCase();
if(attr.indexOf('max-age=')===0&&Number(attr.slice(8))<=0)gone=true;
if(attr.indexOf('expires=')===0){var t=Date.parse(attr.slice(8));if(!isNaN(t)&&t<=new Date().getTime())gone=true;}
}
if(gone)delete jar[name];else jar[name]=value;
}});
}catch(e2){}
}
try{
w.addEventListener('submit',function(e){
try{
var f=e.target,b=e.submitter;
var m=(b&&b.getAttribute&&b.getAttribute('formmethod'))||(f&&f.getAttribute&&f.getAttribute('method'))||'';
if(String(m).toLowerCase()==='dialog')return;
e.preventDefault();
}catch(e2){}
},false);
}catch(e){}
try{
w.addEventListener('click',function(e){
try{
if(e.defaultPrevented||e.button!==0)return;
var a=e.target;
while(a&&!(a.nodeName&&String(a.nodeName).toUpperCase()==='A'&&a.getAttribute&&a.getAttribute('href')!==null))a=a.parentNode;
if(!a||a.hasAttribute('download'))return;
var href=String(a.getAttribute('href')).replace(/^\\s+|\\s+$/g,'');
if(href.charAt(0)==='#'){
e.preventDefault();
var id=href.slice(1);
try{id=decodeURIComponent(id);}catch(e3){}
var target=id===''||id.toLowerCase()==='top'?null:(d.getElementById(id)||d.getElementsByName(id)[0]);
if(target&&target.scrollIntoView)target.scrollIntoView();
else if(id===''||id.toLowerCase()==='top')w.scrollTo(0,0);
return;
}
var scheme=/^([a-z][a-z0-9+.-]*):/i.exec(href);
if(!scheme){e.preventDefault();return;}
var s=scheme[1].toLowerCase();
if(s==='http'||s==='https'||s==='mailto'){e.preventDefault();w.open(href,'_blank','noopener,noreferrer');}
}catch(e2){}
},false);
}catch(e){}
function report(message){
try{
if(sent>=10)return;
sent++;
w.parent.postMessage({source:SRC,type:'error',message:String(message).slice(0,MAX)},'*');
}catch(e){}
}
try{
w.addEventListener('error',function(e){report(e&&e.message?e.message:'Error');},false);
w.addEventListener('unhandledrejection',function(e){
try{var r=e&&e.reason;report(r&&r.message?r.message:String(r));}catch(e2){}
},false);
}catch(e){}
})();`;

const GUARD_MARK = 'data-html-creator-preview';

/** The guard as it is injected; exported for tests. */
export const PREVIEW_GUARD = `<script ${GUARD_MARK}>${GUARD_SOURCE}</script>`;

// \s also covers the byte-order mark (U+FEFF) some editors leave at the start.
const WHITESPACE = /\s/;

/** Index after any run of whitespace and complete comments starting at `from`. */
function skipBlank(html: string, from: number): number {
  let pos = from;
  for (;;) {
    while (pos < html.length && WHITESPACE.test(html[pos])) pos++;
    if (!html.startsWith('<!--', pos)) return pos;
    const end = html.indexOf('-->', pos + 4);
    if (end === -1) return pos;
    pos = end + 3;
  }
}

/** Index just after the `>` closing a tag that starts at `from`, honouring quoted attributes; -1 if unfinished. */
function tagEnd(html: string, from: number): number {
  let quote = '';
  for (let pos = from + 1; pos < html.length; pos++) {
    const char = html[pos];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return pos + 1;
    }
  }
  return -1;
}

/** If an element of this name opens at `pos`, the index after its start tag; otherwise -1. */
function openTag(html: string, pos: number, name: string): number {
  if (html.slice(pos, pos + name.length + 1).toLowerCase() !== `<${name}`) return -1;
  const next = html[pos + name.length + 1];
  if (next !== undefined && next !== '>' && next !== '/' && !WHITESPACE.test(next)) return -1;
  return tagEnd(html, pos);
}

/**
 * Where the guard goes: right after <head>, or where the parser would open the implied
 * head (after <html>, after the doctype or after leading comments). It must not go
 * before the doctype, which would switch the page to quirks mode. Only the prologue is
 * scanned, so a "<head>" written inside the page's body or scripts is never matched.
 */
function guardPosition(html: string): number {
  let pos = skipBlank(html, 0);
  if (html.slice(pos, pos + 9).toLowerCase() === '<!doctype') {
    const end = tagEnd(html, pos);
    if (end === -1) return pos;
    pos = skipBlank(html, end);
  }
  const afterHtml = openTag(html, pos, 'html');
  if (afterHtml !== -1) pos = skipBlank(html, afterHtml);
  const afterHead = openTag(html, pos, 'head');
  return afterHead === -1 ? pos : afterHead;
}

/** The HTML the preview iframe loads: the page with the guard first in its head. */
export function previewDocument(html: string): string {
  const pos = guardPosition(html);
  if (html.startsWith(PREVIEW_GUARD, pos)) return html;
  return html.slice(0, pos) + PREVIEW_GUARD + html.slice(pos);
}

/**
 * While the page streams in, its head (mostly CSS) arrives first. Showing it would be a
 * tall white frame, so the preview waits until the body has started.
 */
export function hasRenderableBody(partial: string): boolean {
  // Either <body> itself, or a complete start tag after </head> that implies it.
  return (
    /<body[\s>/]/i.test(partial) ||
    /<\/head\s*>\s*(?:<!--[\s\S]*?-->\s*)*<(?!body[\s>/])[a-z][a-z0-9-]*[\s>/]/i.test(partial)
  );
}

/** The script error carried by a message from the guard, or null for any other message. */
export function previewErrorMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const message = data as Record<string, unknown>;
  if (message.source !== PREVIEW_MESSAGE_SOURCE || message.type !== 'error') return null;
  if (typeof message.message !== 'string') return null;
  const text = message.message.replace(/\s+/g, ' ').trim().slice(0, MAX_PREVIEW_ERROR_CHARS);
  return text === '' ? null : text;
}
