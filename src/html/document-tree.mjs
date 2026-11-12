import { readHtmlDocument } from "./scan.mjs";

export const HTML_DOCUMENT_MAX_BYTES = 65536;
export const HTML_DOCUMENT_MAX_JSON_BYTES = 1048576;
export const HTML_DOCUMENT_LIMITS = Object.freeze({
  maximumNodes: 8192, maximumAttributes: 8192, maximumDepth: 64,
});

/** Authored offsets are zero-based UTF-16 code units. Implied nodes have no position. */
export function htmlNodeLocation(node, origin = 0) {
  const source = node.sourceCodeLocation;
  return source ? { start: origin + source.startOffset, end: origin + source.endOffset } : null;
}

function projectNode(node, origin) {
  const source = htmlNodeLocation(node, origin);
  switch (node.nodeName) {
    case "#document": return { kind: "document", mode: node.mode, children: [] };
    case "#document-fragment": return { kind: "fragment", children: [] };
    case "#documentType": return { kind: "doctype", name: node.name, publicId: node.publicId, systemId: node.systemId, source };
    case "#text": return { kind: "text", value: node.value, source };
    case "#comment": return { kind: "comment", value: node.data, source };
    default:
      if (!node.tagName) throw new TypeError("unknown native HTML node");
      return {
        kind: "element", name: node.tagName, namespace: node.namespaceURI,
        attributes: node.attrs.map(({ name, value, namespace, prefix }) => ({
          name, value, ...(namespace ? { namespace } : {}), ...(prefix ? { prefix } : {}),
        })),
        children: [], source,
      };
  }
}

/** Project the browser tree as inert data, including the contents of templates. */
export function projectHtmlDocument(text, origin = 0) {
  const source = readHtmlDocument(text, HTML_DOCUMENT_LIMITS);
  const document = projectNode(source, origin);
  const pending = [{ source, value: document }];
  while (pending.length) {
    const { source, value } = pending.pop();
    for (const child of source.childNodes ?? []) {
      const projected = projectNode(child, origin);
      value.children.push(projected);
      pending.push({ source: child, value: projected });
    }
    if (source.content) {
      value.content = projectNode(source.content, origin);
      pending.push({ source: source.content, value: value.content });
    }
  }
  return document;
}
