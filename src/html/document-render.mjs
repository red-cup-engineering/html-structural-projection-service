/**
 * html-document-render-service — the carrier/document-render engine: admits
 * HTML as a carrier covering the caller's document spine, selects the
 * valid document plan of carrier/CSS-system pairs for a render profile, and
 * serializes the result to a complete HTML document string.
 *
 * The HTML parser and renderer share their lexical projection here.
 * CSS style resolution is supplied by the CSS package.
 */
import {
  checkStyleResolutionSettled,
  checkClassMapsValid,
  completionRegimeOf,
  classByNodeId,
  cssTextFromResolvedStyles,
  firstDuplicate,
  nodeIdSet,
} from "@red-cup-engineering/css-engineering-services-section/css-style-resolution";
import { canonical, parse } from "@red-cup-engineering/json-engineering-services-section";
import { admitDocumentSpine } from "@red-cup-engineering/signcell/document-spine";
import { retainedCarrier } from "@red-cup-engineering/signcell/content-address";
import { readHtmlDocument } from "./scan.mjs";
import { isXmlName } from "@red-cup-engineering/xml-document-rendering-service/core";

import { escapeHtmlTextValue as escapeXmlText, escapeHtmlAttributeValue as escapeXmlAttr } from "./lexical.mjs";

const REF_PREFIX = "shp-ref:";

function isRef(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && "ref" in value;
}

function unmark(value) {
  if (isRef(value)) return value;
  return value !== null && typeof value === "object" && "const" in value
    ? value.const
    : value;
}

function htmlText(value) {
  if (isRef(value)) return `${REF_PREFIX}${value.ref}`;
  const unmarked = unmark(value);
  return unmarked !== null && typeof unmarked === "object" ? canonical(unmarked) : String(unmarked);
}

/** Escape a value for HTML text content (`&`, `<`, `>`). */
function escapeText(value) { return escapeXmlText(htmlText(value)); }
function escapeAttr(value) { return escapeXmlAttr(htmlText(value)); }

/* ── carrier ────────────────────────────────────────────────────────────── */

const addressSet = (nodes) => new Set(nodes.map((node) => node.semanticAddress));
const admittedCarriers = new WeakSet();

const nodeFields = new Set(["kind", "nodeId", "element", "semanticAddress", "valuationSite", "attributes", "text", "html", "children"]);
/** Own a finite carrier graph whose typed coordinates and child endpoints resolve. */
function ownCarrierNodes(input, document) {
  if (!Array.isArray(input)) throw new TypeError("carrier nodes must be an array");
  const nodes = retainedCarrier(input);
  canonical(nodes);
  const addresses = new Set(document.addresses.map(({ key }) => key));
  const sites = new Set(document.valuationSites.map(({ address }) => address));
  const byId = new Map();
  for (const node of nodes) {
    if (node === null || typeof node !== "object" || Array.isArray(node) ||
        Object.keys(node).some((key) => !nodeFields.has(key)) ||
        node.kind !== "rendering.htmlCarrier.node" ||
        typeof node.nodeId !== "string" || node.nodeId.length === 0 ||
        typeof node.element !== "string" || !/^[A-Za-z]/u.test(node.element) || !isXmlName(node.element) ||
        typeof node.semanticAddress !== "string" || !addresses.has(node.semanticAddress))
      throw new TypeError("carrier node requires its kind, non-empty identity, element name and native document address");
    if (byId.has(node.nodeId)) throw new TypeError(`duplicate carrier node ${node.nodeId}`);
    byId.set(node.nodeId, node);
    if (node.valuationSite !== undefined && (typeof node.valuationSite !== "string" || !sites.has(node.valuationSite)))
      throw new TypeError(`carrier node ${node.nodeId} names an absent valuation site`);
    if (node.html !== undefined && typeof node.html !== "string") throw new TypeError("trusted carrier HTML must be a string");
    if (node.children !== undefined && (!Array.isArray(node.children) || node.children.some((id) => typeof id !== "string")))
      throw new TypeError("carrier children must be node identities");
    if (node.attributes !== undefined) {
      if (node.attributes === null || typeof node.attributes !== "object" || Array.isArray(node.attributes))
        throw new TypeError("carrier attributes must be a record");
      const names = new Set();
      for (const key of Object.keys(node.attributes)) {
        const folded = key.toLowerCase();
        if (!isXmlName(key) || names.has(folded) ||
            ["data-render-node", "data-semantic-address", "data-valuation-site"].includes(folded))
          throw new TypeError(`invalid, duplicate or reserved carrier attribute ${key}`);
        names.add(folded);
      }
    }
  }
  const incoming = new Map(nodes.map(({ nodeId }) => [nodeId, 0]));
  for (const node of nodes) for (const child of node.children ?? []) {
    if (!byId.has(child)) throw new TypeError(`carrier child ${child} is absent`);
    incoming.set(child, incoming.get(child) + 1);
  }
  const ready = nodes.filter(({ nodeId }) => incoming.get(nodeId) === 0).map(({ nodeId }) => nodeId);
  let visited = 0;
  for (let next = 0; next < ready.length; next += 1) {
    visited += 1;
    for (const child of byId.get(ready[next]).children ?? []) {
      const left = incoming.get(child) - 1;
      incoming.set(child, left);
      if (left === 0) ready.push(child);
    }
  }
  if (visited !== nodes.length) throw new TypeError("carrier child geometry is cyclic");
  return nodes;
}


const carrierObstruction = (reason, key) =>
  Object.freeze({ kind: "rendering.htmlCarrier-obstruction", reason, key });

/** Verify carrier coverage of the caller's document addresses, edges, and valuation sites. */
export function htmlCarrierOf(
  document,
  nodes,
) {
  const admission = admitDocumentSpine(document);
  if (!admission.ok) return carrierObstruction("invalid-document-spine", admission.refusal.message);
  document = admission.value;
  try { nodes = ownCarrierNodes(nodes, document); canonical(document); }
  catch (error) { return carrierObstruction("unprojectable-content", error.message); }
  const duplicate = firstDuplicate(nodes.map((node) => node.nodeId));
  if (duplicate !== undefined) return carrierObstruction("duplicate-node", duplicate);
  const addresses = addressSet(nodes);
  for (const address of document.addresses) {
    if (!addresses.has(address.key)) return carrierObstruction("missing-address", address.key);
  }
  for (const edge of document.order) {
    if (!addresses.has(edge.before) || !addresses.has(edge.after)) {
      return carrierObstruction("missing-order", `${edge.before}->${edge.after}`);
    }
  }
  for (const reference of document.references) {
    if (!addresses.has(reference.from) || !addresses.has(reference.to)) {
      return carrierObstruction("missing-reference", `${reference.from}->${reference.to}`);
    }
  }
  const valuationSites = new Set(nodes.map((node) => node.valuationSite ?? node.semanticAddress));
  for (const site of document.valuationSites) {
    if (!valuationSites.has(site.address)) return carrierObstruction("missing-valuation-site", site.address);
  }
  const carrier = Object.freeze({
    kind: "rendering.htmlCarrier",
    document,
    nodes: Object.freeze([...nodes]),
    carriedAddresses: document.addresses,
    carriedOrder: document.order,
    carriedReferences: document.references,
    carriedValuationSites: document.valuationSites,
    documentProjection: Object.freeze({
      kind: "rendering.document-spine-coverage",
      spineIdentity: document.identity,
    }),
  });
  admittedCarriers.add(carrier);
  return carrier;
}

/* ── render profile / document plan ──────────────────────────────────────── */

const requiredLaws = Object.freeze([
  "preserve-addresses",
  "preserve-order",
  "preserve-references",
  "preserve-valuation-sites",
  "carrier-not-document",
  "css-settles",
]);

const renderFiberObstruction = (
  reason,
  key,
) => Object.freeze({ kind: "rendering.profile_forms_render_fiber-obstruction", reason, key });

/** A profile selects the valid document plan of carrier/CSS-system pairs for a use regime. */
export function buildHtmlDocumentPlan(
  profile,
  carrier,
  system,
  styleBehavior,
) {
  if (!admittedCarriers.has(carrier)) return renderFiberObstruction("unadmitted-carrier", carrier?.kind ?? "missing");
  if (system?.carrier !== carrier) return renderFiberObstruction("carrier-system-mismatch", system?.carrier?.kind ?? "missing");
  try {
    profile = retainedCarrier(profile);
    const { carrier: suppliedCarrier, ...source } = system;
    system = Object.freeze({ ...retainedCarrier(source), carrier });
  } catch (error) {
    return renderFiberObstruction("unprojectable-plan-source", error.message);
  }
  const allowedElements = new Set(profile.allowedElements);
  for (const node of carrier.nodes) {
    if (!allowedElements.has(node.element)) return renderFiberObstruction("element-not-allowed", node.element);
  }
  if (!profile.allowedStyleBehavior.includes(styleBehavior)) {
    return renderFiberObstruction("style-behavior-not-allowed", styleBehavior);
  }
  const completionRegime = completionRegimeOf(system);
  if (!profile.allowedCompletionRegimes.includes(completionRegime)) {
    return renderFiberObstruction("completion-regime-not-allowed", completionRegime);
  }
  for (const law of requiredLaws) {
    if (!profile.preservationLaws.includes(law)) return renderFiberObstruction("missing-preservation-law", law);
  }
  if (system.classFactorMap !== undefined) {
    const carrierNodes = nodeIdSet(carrier.nodes);
    for (const nodeId of system.classFactorMap.nodeIds) {
      if (!carrierNodes.has(nodeId)) return renderFiberObstruction("class-factor-map-carrier-mismatch", nodeId);
    }
    const factor = checkClassMapsValid(system.classFactorMap);
    if (factor.kind !== "rendering.css_classes_are_factor_maps:witness") {
      return renderFiberObstruction("class-factor-map-obstructed", factor.reason);
    }
  }
  const cssSettled = checkStyleResolutionSettled(system);
  return Object.freeze({
    kind: "rendering.profile_forms_render_fiber:witness",
    fiber: Object.freeze({
      kind: "rendering.profile.fiber",
      profile,
      carrier,
      system,
      valuation: cssSettled.valuation,
      styleBehavior,
    }),
    cssSettled,
    carrierPreservesDocument: true,
    profileConstrainsFiber: true,
  });
}

/* ── projector ──────────────────────────────────────────────────────────── */

const renderHtmlAttr = ([key, value]) =>
  value === "" ? ` ${key}` : ` ${key}="${escapeAttr(value)}"`;

function renderCarrierNode(
  node,
  byId,
  classNames,
  seen,
  rendered,
) {
  rendered.push(node);
  if (seen.has(node.nodeId)) throw new TypeError(`renderHtmlDocument: cyclic carrier node ${node.nodeId}`);
  const nextSeen = new Set(seen);
  nextSeen.add(node.nodeId);
  const className = classNames.get(node.nodeId);
  const ownClass = node.attributes?.class;
  const attributes = {
    ...(node.attributes ?? {}),
    "data-render-node": node.nodeId,
    "data-semantic-address": node.semanticAddress,
    ...(node.valuationSite === undefined ? {} : { "data-valuation-site": node.valuationSite }),
    ...(className === undefined
      ? {}
      : { class: ownClass === undefined || ownClass === "" ? className : `${ownClass} ${className}` }),
  };
  const body = `${node.text === undefined ? "" : escapeText(node.text)}${node.html ?? ""}${(node.children ?? []).map((childId) => {
    const child = byId.get(childId);
    if (child === undefined) throw new TypeError(`renderHtmlDocument: missing child carrier node ${childId}`);
    return renderCarrierNode(child, byId, classNames, nextSeen, rendered);
  }).join("")}`;
  return `<${node.element}${Object.entries(attributes).map(renderHtmlAttr).join("")}>${body}</${node.element}>`;
}

function rootNodeIds(nodes, requested) {
  if (requested !== undefined) return requested;
  const childIds = new Set(nodes.flatMap((node) => node.children ?? []));
  return Object.freeze(nodes.filter((node) => !childIds.has(node.nodeId)).map((node) => node.nodeId));
}

/** Serialize the single admitted render codomain: a document plan over an HTML carrier and settled CSS valuation. */
export function renderHtmlDocument(
  fiber,
  options = {},
) {
  const input = fiber?.fiber;
  fiber = buildHtmlDocumentPlan(input?.profile, input?.carrier, input?.system, input?.styleBehavior);
  if (fiber.kind !== "rendering.profile_forms_render_fiber:witness")
    throw new TypeError(`renderHtmlDocument: ${fiber.reason}: ${fiber.key}`);
  const rendered = [];
  const spine = fiber.fiber.carrier.document;
  const byId = new Map(fiber.fiber.carrier.nodes.map((node) => [node.nodeId, node]));
  const roots = rootNodeIds(fiber.fiber.carrier.nodes, options.roots);
  const classes = fiber.fiber.system.classFactorMap;
  const classNames = classByNodeId(classes);
  const body = roots.map((rootId) => {
    const root = byId.get(rootId);
    if (root === undefined) throw new TypeError(`renderHtmlDocument: missing root carrier node ${rootId}`);
    return renderCarrierNode(root, byId, classNames, new Set(), rendered);
  }).join("\n");
  const positions = new Map();
  rendered.forEach((node, index) => { if (!positions.has(node.semanticAddress)) positions.set(node.semanticAddress, index); });
  for (const { key } of spine.addresses)
    if (!positions.has(key)) throw new TypeError(`renderHtmlDocument: roots omit document address ${key}`);
  const renderedSites = new Set(rendered.map((node) => node.valuationSite ?? node.semanticAddress));
  for (const { address } of spine.valuationSites)
    if (!renderedSites.has(address)) throw new TypeError(`renderHtmlDocument: roots omit valuation site ${address}`);
  for (const { before, after } of spine.order)
    if (positions.get(before) >= positions.get(after)) throw new TypeError(`renderHtmlDocument: node order differs from explicit document order ${before}->${after}`);
  const spineText = canonical(spine);
  const metadata = Object.entries(options.metadata ?? {})
    .map(([key, value]) => `    <meta name="${escapeAttr(key)}" content="${escapeAttr(value)}">`)
    .join("\n");
  const head = (options.head ?? []).map((fragment) => `    ${fragment}`).join("\n");
  const css = cssTextFromResolvedStyles(fiber.fiber.valuation, classes);
  const title = options.title ?? fiber.fiber.profile.name;
  const bodyAttributes = Object.entries(options.bodyAttributes ?? {}).map(renderHtmlAttr).join("");
  const html = `<!DOCTYPE html>
<html lang="${escapeAttr(options.lang ?? "en")}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="render-profile" content="${escapeAttr(fiber.fiber.profile.name)}">${metadata ? "\n" + metadata : ""}
    <title>${escapeText(title)}</title>${head ? "\n" + head : ""}
    <style>${css}</style>
</head>
<body${bodyAttributes}>
${body}
<template data-document-spine="${escapeAttr(spine.identity)}">${escapeXmlText(spineText)}</template>
</body>
</html>
`;
  const parsed = readHtmlDocument(html);
  receiveCarrierGeometry(parsed, fiber.fiber.carrier, roots, rendered);
  const received = spineOfParsedDocument(parsed);
  if (canonical(received) !== spineText) throw new TypeError("renderHtmlDocument: document spine changed during HTML projection");
  return Object.freeze({
    kind: "rendering.htmlFiber.document",
    fiber,
    html,
  });
}

/** Receive the complete inert document spine through the existing HTML parser.
 * Geometry and cells are data; settlement and issuer authority remain separate.
 */
export function documentSpineOfHtml(html, limits = {}) {
  return spineOfParsedDocument(readHtmlDocument(String(html), limits));
}

function spineOfParsedDocument(parsed) {
  const templates = [];
  const pending = [parsed];
  while (pending.length) {
    const node = pending.pop();
    if (node.tagName === "template") {
      const identity = node.attrs?.find(({ name }) => name === "data-document-spine")?.value;
      if (identity !== undefined) {
        templates.push({ node, identity });
        continue;
      }
    }
    for (const child of node.childNodes ?? []) pending.push(child);
    if (node.content) pending.push(node.content);
  }
  if (templates.length !== 1) throw new TypeError("documentSpineOfHtml: exactly one spine carrier is required");
  const { node, identity } = templates[0];
  const children = node.content?.childNodes ?? [];
  if (children.some((child) => child.nodeName !== "#text"))
    throw new TypeError("documentSpineOfHtml: spine content must be inert JSON text");
  const raw = parse(children.map(({ value }) => value).join(""));
  const admitted = admitDocumentSpine(raw);
  if (!admitted.ok) throw new TypeError(admitted.refusal.message);
  if (admitted.value.identity !== identity) throw new TypeError("documentSpineOfHtml: carrier identity differs from its content");
  if (canonical(raw) !== canonical(admitted.value))
    throw new TypeError("documentSpineOfHtml: raw typed coordinates differ from their reconstruction");
  return admitted.value;
}

/** Verify the actual parsed carrier, allowing unmarked browser-implied wrappers. */
function receiveCarrierGeometry(parsed, carrier, roots, emitted) {
  const byId = new Map(carrier.nodes.map((node) => [node.nodeId, node]));
  const rootIds = new Set(roots);
  const received = [];
  const pending = [{ node: parsed, parent: undefined }];
  const foldedName = (value) => value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  while (pending.length) {
    const { node, parent } = pending.pop();
    const attrs = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
    let at = parent;
    if (Object.hasOwn(attrs, "data-render-node")) {
      const expected = byId.get(attrs["data-render-node"]);
      if (expected === undefined || typeof node.tagName !== "string" ||
          foldedName(node.tagName) !== foldedName(expected.element) ||
          attrs["data-semantic-address"] !== expected.semanticAddress ||
          attrs["data-valuation-site"] !== expected.valuationSite)
        throw new TypeError("renderHtmlDocument: parsed carrier coordinates differ from their declared node");
      if (parent === undefined ? !rootIds.has(expected.nodeId) : !(parent.children ?? []).includes(expected.nodeId))
        throw new TypeError("renderHtmlDocument: parsed carrier parent differs from its declared geometry");
      received.push(expected);
      at = expected;
    }
    // Template content is an inert document fragment, not rendered children.
    const children = node.childNodes ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1)
      pending.push({ node: children[index], parent: at });
  }
  if (canonical(received.map(({ nodeId }) => nodeId)) !== canonical(emitted.map(({ nodeId }) => nodeId)))
    throw new TypeError("renderHtmlDocument: browser parsing changed carrier traversal or root membership");
  const positions = new Map();
  received.forEach((node, index) => { if (!positions.has(node.semanticAddress)) positions.set(node.semanticAddress, index); });
  for (const { before, after } of carrier.document.order)
    if (positions.get(before) >= positions.get(after))
      throw new TypeError("renderHtmlDocument: parsed carrier violates explicit document order");
  return received;
}
