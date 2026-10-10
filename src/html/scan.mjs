import {parse,defaultTreeAdapter} from 'parse5';
import {decodeHTML,decodeHTMLAttribute} from 'entities';
export const decodeHtmlEntities=(value,context='text')=>{
 if(context!=='text'&&context!=='attribute')throw new TypeError('HTML entity context must be text or attribute');
 return context==='attribute'?decodeHTMLAttribute(value):decodeHTML(value);
};
/** Native HTML document parsing; no scripts, fetching or browser layout. */
export function readHtmlDocument(html,{maximumNodes=Infinity,maximumDepth=Infinity,maximumAttributes=Infinity,onParseError}={}){
 let created=0;
 const treeAdapter={...defaultTreeAdapter,createElement(...args){if(++created>maximumNodes)throw new RangeError('HTML exceeds its node limit');return defaultTreeAdapter.createElement(...args);}};
 const document=parse(html,{sourceCodeLocationInfo:true,scriptingEnabled:true,treeAdapter,onParseError});
 const stack=[{node:document,depth:0}];let nodes=0,attributes=0;
 while(stack.length){const {node,depth}=stack.pop();if(++nodes>maximumNodes||depth>maximumDepth)throw new RangeError('HTML exceeds its node/depth limit');attributes+=node.attrs?.length??0;if(attributes>maximumAttributes)throw new RangeError('HTML exceeds its attribute limit');for(const child of node.childNodes??[])stack.push({node:child,depth:depth+1});if(node.content)stack.push({node:node.content,depth:depth+1});}
 return document;
}
/** Explicit parsed start tags in authored order; inert bodies remain excluded.
 * Browser tree correction may discard tags. Implied nodes have no source row.
 * Indices are zero-based UTF-16 code units in the original input, not bytes.
 */
export function startTagsOfDocument(document){
 const out=[],stack=[document];
 while(stack.length){const node=stack.pop();if(node.tagName){const at=node.sourceCodeLocation?.startTag??node.sourceCodeLocation;if(at){const attrs=Object.fromEntries((node.attrs??[]).map(a=>[(a.prefix?a.prefix+':':'')+a.name,a.value]));out.push(Object.freeze({name:node.tagName.toLowerCase(),attrs:Object.freeze(attrs),index:at.startOffset}));}if(['script','style','template'].includes(node.tagName.toLowerCase()))continue;}
  for(const child of node.childNodes??[])stack.push(child);
 }
 out.sort((a,b)=>a.index-b.index);return Object.freeze(out);
}
export const scanHtmlStartTags=html=>startTagsOfDocument(readHtmlDocument(html));
export const relTokens=attrs=>attrs.rel?Object.freeze(attrs.rel.trim().toLowerCase().split(/\s+/).filter(Boolean)):Object.freeze([]);
/** First parsed base href, with the actual document URL as fallback. */
export function documentBaseFromTags(tags,fallbackUrl){for(const tag of tags){if(tag.name==='base'&&tag.attrs.href!==undefined){try{return new URL(tag.attrs.href,fallbackUrl).href;}catch{return fallbackUrl;}}}return fallbackUrl;}
export const htmlDocumentBase=(html,fallbackUrl)=>documentBaseFromTags(scanHtmlStartTags(html),fallbackUrl);
