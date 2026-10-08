import assert from "node:assert/strict";
import test from "node:test";
import { evidence, told } from "@red-cup-engineering/signcell/cell";
import { readingOfSides } from "@red-cup-engineering/computer-data-services-section/four";
import { fromSection, markup, project, unmark } from "../src/html/index.mjs";

const fixtureSection = () => ({
  affirmed: [{ predicate: { const: "id" }, object: { const: "c1" }, citation: { const: "ta" } }],
  denied: [{ predicate: { const: "blocked" }, object: { const: "yes" }, citation: { const: "tc" } }],
});

test("unwraps SHP constants and reads living FOUR coordinates", () => {
  assert.equal(unmark({ const: "value" }), "value");
  assert.equal(readingOfSides("knowledge", true, false), "potential");
  assert.deepEqual(told(evidence({ for: ["ta"], against: ["tb"] })), [true, true]);
});

test("fromSection projects affirmed and contradicted evidence without inventing cells", () => {
  const dataform = fromSection(fixtureSection(), { subject: "work/c1" });
  assert.equal(dataform.subject, "work/c1");
  assert.equal(dataform.cells.length, 2);
  assert.deepEqual(dataform.cells.map(({ evidence: e }) => told(e)), [[true, false], [false, true]]);
  assert.deepEqual(markup(project(dataform)), dataform.cells);
});

test("an empty section renders no cells", () => {
  const dataform = fromSection({}, { subject: "work/empty" });
  assert.deepEqual(dataform.cells, []);
  assert.match(project(dataform), /data-cells="0"/u);
});
