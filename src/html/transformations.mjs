/** Paid operations on native HTML characters and parsed document carriers. */
import {encodeHTML} from 'entities';
import {encodeUtf8Source} from '@red-cup-engineering/signcell/source-codec';
import {HTML_DOCUMENT_MAX_BYTES, HTML_DOCUMENT_MAX_JSON_BYTES, HTML_DOCUMENT_LIMITS, htmlNodeLocation} from './document-tree.mjs';
import {htmlDocumentSourceCodec} from './source-codec.mjs';
import {decodeHtmlEntities,readHtmlDocument,startTagsOfDocument,documentBaseFromTags,relTokens} from './scan.mjs';
const HTML='http://www.w3.org/1999/xhtml';
function request(body,required,optional=[]){if(!body||typeof body!=='object'||Array.isArray(body)||required.some(key=>!Object.hasOwn(body,key))||Object.keys(body).some(key=>!required.includes(key)&&!optional.includes(key)))throw new TypeError('HTML operation has missing or unknown request fields');}
function inputBytes(value) {
 if(typeof value!=='string'||!value.isWellFormed())throw new TypeError('input must be well-formed Unicode text');
 if(value.length>HTML_DOCUMENT_MAX_BYTES)throw new RangeError('HTML input exceeds 65536 UTF-8 bytes');
 const bytes=encodeUtf8Source(value);
 if(bytes.byteLength>HTML_DOCUMENT_MAX_BYTES)throw new RangeError('HTML input exceeds 65536 UTF-8 bytes');
 return bytes;
}
function text(value){inputBytes(value);return value;}
function output(result){if(Buffer.byteLength(JSON.stringify(result))>HTML_DOCUMENT_MAX_JSON_BYTES)throw new RangeError('HTML result exceeds 1048576 JSON UTF-8 bytes');return result;}
function document(body,onParseError){return readHtmlDocument(text(body.html),{...HTML_DOCUMENT_LIMITS,...(onParseError?{onParseError}:{})});}
export function decodeHtmlEntityText(body){request(body,['text'],['context']);const context=body.context??'text';if(!['text','attribute'].includes(context))throw new TypeError('context must be text or attribute');const decoded=decodeHtmlEntities(text(body.text),context);return output({text:decoded,byteLength:Buffer.byteLength(decoded),context});}
export function encodeHtmlEntityText(body){request(body,['text']);const value=text(body.text);if(value.includes('\u0000'))throw new TypeError('HTML cannot retain NUL as character data');const encoded=encodeHTML(value).replaceAll('\r','&#13;');if(decodeHtmlEntities(encoded)!==value)throw new TypeError('HTML character references cannot retain this value');return output({text:encoded,byteLength:Buffer.byteLength(encoded)});}
export function htmlToJsonTree(body) {
 request(body, ["html"]);
 return structuredClone(htmlDocumentSourceCodec.read(inputBytes(body.html)).value);
}
export function htmlParsingDiagnostics(body){request(body,['html']);const diagnostics=[];let totalCount=0;const doc=document(body,error=>{totalCount++;if(diagnostics.length<64)diagnostics.push({code:error.code,line:error.startLine??null,column:error.startCol??null,index:error.startOffset??null});});return output({diagnostics,totalCount,truncated:totalCount>64,mode:doc.mode,sourceByteLength:Buffer.byteLength(body.html),offsetUnit:'UTF-16 code units'});}
export function htmlDocumentLinks(body){request(body,['html'],['documentUrl']);let fallback;if(body.documentUrl!==undefined){if(typeof body.documentUrl!=='string'||body.documentUrl.length>8192)throw new TypeError('documentUrl must be an absolute HTTP(S) URL, up to8192characters');try{const u=new URL(body.documentUrl);if(!['http:','https:'].includes(u.protocol))throw Error();fallback=u.href;}catch{throw new TypeError('documentUrl must be an absolute HTTP(S) URL');}}
 const tags=startTagsOfDocument(document(body)),baseUrl=documentBaseFromTags(tags,fallback);const links=[];for(const tag of tags){if(!['a','area','link'].includes(tag.name)||tag.attrs.href===undefined)continue;let url=null;try{url=new URL(tag.attrs.href,baseUrl).href;}catch{}links.push({tag:tag.name,href:tag.attrs.href,url,rel:relTokens(tag.attrs),index:tag.index});}return output({links,baseUrl:baseUrl??null,sourceByteLength:Buffer.byteLength(body.html),offsetUnit:'UTF-16 code units'});
}
export function htmlBodyText(body){request(body,['html']);const doc=document(body),html=doc.childNodes.find(n=>n.tagName==='html'&&n.namespaceURI===HTML),bodyNode=html?.childNodes.find(n=>n.tagName==='body'&&n.namespaceURI===HTML);const stack=bodyNode?[bodyNode]:[],nodes=[];while(stack.length){const node=stack.pop();if(node.tagName&&['script','style','template','noscript'].includes(node.tagName.toLowerCase()))continue;if(node.nodeName==='#text')nodes.push({text:node.value,source:htmlNodeLocation(node)});const children=node.childNodes??[];for(let i=children.length-1;i>=0;i--)stack.push(children[i]);}const value=nodes.map(n=>n.text).join('');return output({text:value,nodes,byteLength:Buffer.byteLength(value),sourceByteLength:Buffer.byteLength(body.html),offsetUnit:'UTF-16 code units'});}
