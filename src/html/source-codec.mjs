import { decodeUtf8Source, defineSourceCodec, encodeUtf8Source } from "@red-cup-engineering/signcell/source-codec";
import { HTML_DOCUMENT_MAX_BYTES, HTML_DOCUMENT_MAX_JSON_BYTES, projectHtmlDocument } from "./document-tree.mjs";

/** Bounded HTML parsing with the exact input and the projected document tree. */
export const htmlDocumentSourceCodec = defineSourceCodec({
  id: "html.document-tree/v1",
  mediaType: "text/html",
  maxBytes: HTML_DOCUMENT_MAX_BYTES,
  valueIdentity: "exact",
  decode(bytes) {
    const text = decodeUtf8Source(bytes);
    // HTML consumes a byte-order mark before tokenization. Source locations
    // remain relative to the original UTF-8-decoded text.
    const origin = text.startsWith("\uFEFF") ? 1 : 0;
    const document = projectHtmlDocument(text.slice(origin), origin);
    const value = { document, sourceByteLength: bytes.byteLength, offsetUnit: "UTF-16 code units" };
    if (encodeUtf8Source(JSON.stringify(value)).byteLength > HTML_DOCUMENT_MAX_JSON_BYTES)
      throw new RangeError("HTML result exceeds 1048576 JSON UTF-8 bytes");
    return value;
  },
});
