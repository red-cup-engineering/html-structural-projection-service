/**
 * formats/html/document - safe HTML document assembly.
 *
 * This is the conventional web-facing companion to the SHP and render-fiber
 * codecs in this directory: it gives static renderers a shared, escaped node
 * tree instead of each renderer owning a private document string template.
 */
import { escapeHtmlAttributeValue as escapeXmlAttr, escapeHtmlTextValue as escapeXmlText } from "./lexical.mjs";
const HTML_NAME = /^[A-Za-z][A-Za-z0-9:-]*$/u;
const VOID_ELEMENTS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
]);
function requireHtmlName(name) {
    if (!HTML_NAME.test(name))
        throw new TypeError(`html: ${JSON.stringify(name)} is not a valid HTML name`);
    return name;
}
/** Build an escaped text node. */
export function htmlText(value) {
    return Object.freeze({ kind: "text", value });
}
/**
 * Mark already-rendered HTML as a trusted fragment.
 *
 * Use this only at named codec boundaries, such as Markdown body projection or
 * schema.org JSON-LD script rendering. Ordinary text belongs in `htmlText` or
 * bare string children.
 */
export function htmlFragment(html) {
    return Object.freeze({ kind: "fragment", html });
}
/** Build an HTML element node, lifting bare strings to escaped text nodes. */
export function htmlElement(name, attributes = {}, children = []) {
    const renderedChildren = [];
    for (const child of children) {
        if (child === null || child === undefined || child === false)
            continue;
        renderedChildren.push(typeof child === "string" ? htmlText(child) : child);
    }
    return Object.freeze({
        kind: "element",
        name: requireHtmlName(name),
        attributes: Object.freeze({ ...attributes }),
        children: Object.freeze(renderedChildren),
    });
}
function renderAttributes(attributes) {
    let rendered = "";
    for (const [name, value] of Object.entries(attributes)) {
        if (value === null || value === undefined || value === false)
            continue;
        requireHtmlName(name);
        rendered += value === true ? ` ${name}` : ` ${name}="${escapeXmlAttr(String(value))}"`;
    }
    return rendered;
}
/** Serialize one node to HTML. */
export function renderHtmlNode(node) {
    if (node.kind === "text")
        return escapeXmlText(node.value);
    if (node.kind === "fragment")
        return node.html;
    const name = node.name.toLowerCase();
    if (VOID_ELEMENTS.has(name)) {
        if (node.children.length > 0)
            throw new TypeError(`html: void element <${node.name}> cannot have children`);
        return `<${node.name}${renderAttributes(node.attributes)}>`;
    }
    return `<${node.name}${renderAttributes(node.attributes)}>${node.children.map(renderHtmlNode).join("")}</${node.name}>`;
}
function renderChildren(children) {
    return children
        .filter((child) => child !== null && child !== undefined && child !== false)
        .map((child) => typeof child === "string" ? escapeXmlText(child) : renderHtmlNode(child))
        .join("");
}
function renderDocumentChildren(children) {
    return children
        .filter((child) => child !== null && child !== undefined && child !== false)
        .map((child) => typeof child === "string" ? escapeXmlText(child) : renderHtmlNode(child))
        .filter((child) => child !== "")
        .join("\n");
}
/** Render a complete HTML5 document from escaped node trees. */
export function renderHtmlDocument(input) {
    const lang = escapeXmlAttr(input.lang ?? "en");
    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
${renderDocumentChildren(input.head)}
</head>
<body>
${renderDocumentChildren(input.body)}
</body>
</html>
`;
}
