// Cross-layer conformance: does this section's carrier codec honour the
// settledDocument contract SignCraft defines? Presentation is downstream of the
// Sign libraries (metrologic, signcell, signchain, signgraph, signcraft), so the
// codec is checked here against the contract it renders, with SignCraft as a
// development dependency; SignCraft's own suite does not reach into HTML.
import assert from "node:assert/strict";
import test from "node:test";
import { cell } from "@red-cup-engineering/signcell/cell";
import { settleCells, documentOfSettlement } from "@red-cup-engineering/signcraft/settle";

test("carries trusted codec fragments and document chrome through a render fiber", async () => {
  const told = cell("page", "contains", "section", { for: [{ subject: "page", predicate: "contains", object: "section" }] });
  const document = documentOfSettlement(settleCells([told]));
  assert.equal(document.kind, "signcraft.document");
  const { spine } = document;
  const addresses = spine.addresses.map((entry) => entry.key);
  assert.ok(addresses.length >= 1);
  const { htmlCarrierOf, buildHtmlDocumentPlan, renderHtmlDocument: renderHtmlDocumentFromPlan } = await import("../src/html/index.mjs");
  const carrier = htmlCarrierOf(spine, addresses.map((key) => ({
    kind: "rendering.htmlCarrier.node",
    nodeId: key,
    element: "main",
    semanticAddress: key,
    html: "<strong>trusted</strong>",
  })));
  assert.equal(carrier.kind, "rendering.htmlCarrier");
  assert.equal(carrier.document.kind, "signcell.document-spine");
  assert.equal(carrier.document.identity, spine.identity);
  assert.equal(carrier.documentProjection.kind, "rendering.document-spine-coverage");
  const profile = {
    kind: "rendering.profile",
    name: "fixture",
    allowedElements: ["main"],
    allowedStyleBehavior: ["static"],
    allowedCompletionRegimes: ["strict"],
    obligations: [],
    preservationLaws: ["preserve-addresses", "preserve-order", "preserve-references", "preserve-valuation-sites", "carrier-not-document", "css-settles"],
  };
  const system = { kind: "rendering.css.system", carrier, declarations: [] };
  const fiber = buildHtmlDocumentPlan(profile, carrier, system, "static");
  assert.equal(fiber.kind, "rendering.profile_forms_render_fiber:witness");
  const rendered = renderHtmlDocumentFromPlan(fiber, {
    head: ['<meta name="fixture" content="yes">'],
    bodyAttributes: { class: "fixture", hidden: "" },
  }).html;
  assert.match(rendered, /<meta name="fixture" content="yes">/);
  assert.match(rendered, /<body class="fixture" hidden>/);
  assert.match(rendered, /<main data-render-node="([^"]+)" data-semantic-address="\1"><strong>trusted<\/strong><\/main>/);
});
