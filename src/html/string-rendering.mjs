/**
 * Small HTML string rendering primitives.
 *
 * These preserve the established content/microformat wire format: nullish
 * values become empty, quotes are escaped in every position, boolean true
 * attributes are bare, false/nullish attributes are omitted, class tokens are
 * de-duplicated in encounter order, and void elements use XHTML ` />` spelling.
 */
import {escapeHtmlAttributeValue} from './lexical.mjs';
export function escapeHtml(value) { return escapeHtmlAttributeValue(String(value ?? "")); }
export function attrs(map) {
    if (!map)
        return "";
    let out = "";
    for (const [name, value] of Object.entries(map)) {
        if (value === null || value === undefined || value === false)
            continue;
        if (value === true) {
            out += ` ${name}`;
            continue;
        }
        out += ` ${name}="${escapeHtml(value)}"`;
    }
    return out;
}
const XHTML_VOID_ELEMENTS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
]);
/** Children are trusted, already-rendered HTML fragments by contract. */
export function el(tag, attributes, children) {
    const open = `<${tag}${attrs(attributes)}`;
    if (XHTML_VOID_ELEMENTS.has(tag))
        return `${open} />`;
    const inner = Array.isArray(children) ? children.join("") : children ?? "";
    return `${open}>${inner}</${tag}>`;
}
