import assert from "node:assert/strict";
import test from "node:test";
import { addressContent } from "@red-cup-engineering/signcell/content-address/raw";
import { htmlDocumentSourceCodec } from "@red-cup-engineering/html-structural-projection-service/source-codec";
import { htmlToJsonTree } from "@red-cup-engineering/html-structural-projection-service/transformations";

test("the installed HTML codec retains native tree recovery and positions in its exact source", () => {
  const html = "\uFEFF<!doctype html><title>Étude</title>\r\n<table>outside<tr><td>inside</table><template><b>inert</b></template>";
  const bytes = Buffer.from(html);
  const reading = htmlDocumentSourceCodec.read(bytes);
  assert.equal(reading.source.ni, addressContent(bytes).ni);
  assert.deepEqual(reading.value, htmlToJsonTree({ html }));
  const { document } = reading.value;
  assert.equal(document.mode, "no-quirks");
  assert.deepEqual(document.children[0].source, { start: 1, end: html.indexOf("<title>") });
  const body = document.children.find(node => node.name === "html").children.find(node => node.name === "body");
  const table = body.children.find(node => node.name === "table");
  assert.equal(table.children[0].name, "tbody");
  assert.equal(table.children[0].source, null);
  assert.equal(body.children.find(node => node.name === "template").content.children[0].name, "b");
  assert.throws(() => htmlDocumentSourceCodec.read(Buffer.from([0xff])), { code: "ERR_ENCODING_INVALID_ENCODED_DATA" });
});
