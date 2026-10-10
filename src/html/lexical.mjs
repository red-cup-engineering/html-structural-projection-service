/** HTML display characters and lexical escaping; original typed JSON remains separate. */
import {escapeXmlText,escapeXmlAttr} from '@red-cup-engineering/xml-document-rendering-service/core';
export const htmlDisplayText=value=>String(value).replaceAll('\u0000','\uFFFD');
export const escapeHtmlTextValue=value=>escapeXmlText(htmlDisplayText(value)).replaceAll('\r','&#13;');
export const escapeHtmlAttributeValue=value=>escapeXmlAttr(htmlDisplayText(value)).replaceAll('\r','&#13;');
