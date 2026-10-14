/**
 * codecs/html - the Semantic Hypertext Packet (SHP) codec: a carrier⇄HTML
 * holography projector.
 *
 * SHP is a finite, deterministic, MONOTONE projection of a settled carrier
 * frontier into HTML, where `class` names a morphism identity and `data-*`
 * attributes carry carrier coordinates (entity/attribute/value + bilattice
 * sides), with RFC 7992 as one pluggable inhabitant profile. `project` is the
 * write direction (cells → HTML), `markup` the read direction (HTML → cells with
 * their told evidence), and `htmlProjector` binds both into the holography kernel —
 * so the markup boundary carries the same evidence as everything else.
 *
 * The whole subtree (escape, morphism, markup, lint, profiles, normalize,
 * project, packet, projector) is owned by the HTML codec service.
 */
import { define as defineResourceProjector } from "@red-cup-engineering/computer-content-engineering-services-section/typed-resource-classification";
import { evidence as toldEvidence, sidesOf } from "@red-cup-engineering/signcell/cell";
import { calmReadingOf, readingMark, readingOf } from "@red-cup-engineering/xml-document-rendering-service/svg";
import { canonical, parse } from "@red-cup-engineering/json-services-section";
import { sha256Bytes } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/portable-sha256";
import { slugify as slugifyText } from "@red-cup-engineering/computer-text-content-engineering-services-section/slugify-text";
import { decodeHtmlEntities, scanHtmlStartTags } from "./scan.mjs";
import { htmlDisplayText, escapeHtmlTextValue, escapeHtmlAttributeValue } from "./lexical.mjs";
import { validateShpDocumentBytes } from "./shp-profile.mjs";
import { readingOfSides } from "@red-cup-engineering/computer-data-engineering-services-section/four";
export * from "./string-rendering.mjs";
export * from "./scan.mjs";
/** The wire prefix distinguishing an entity reference from a literal string. */
export const REF_PREFIX = "shp-ref:";
export function ref(entityId) {
    return Object.freeze({ ref: entityId });
}
export function isRef(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) && "ref" in value && typeof value.ref === "string" && Object.keys(value).length === 1;
}
function htmlText(value) {
    if (isRef(value))
        return htmlDisplayText(`${REF_PREFIX}${value.ref}`);
    const unmarked = unmark(value);
    return htmlDisplayText(unmarked !== null && typeof unmarked === "object" ? canonical(unmarked) : String(unmarked));
}
/** Escape a value for HTML text content (`&`, `<`, `>`). */
export function escapeText(value) { return escapeHtmlTextValue(htmlText(value)); }
/** Escape a value for a quoted HTML attribute. */
export function escapeAttr(value) { return escapeHtmlAttributeValue(htmlText(value)); }
/** A URL/id-safe slug derived from a value, falling back to "cell" when empty. */
export function slug(value) {
    return slugifyText(String(value).trim()) || "cell";
}
/** Unwrap a marked value: the inner `const` when present, else the value. */
export function unmark(value) {
    if (isRef(value))
        return value;
    return value !== null && typeof value === "object" && "const" in value
        ? value.const
        : value;
}
/** Evidence is contested when it is told both for and against (stable). */
export function isContested(e) {
    return sidesOf(e)[0] && sidesOf(e)[1];
}
/** Normalize a `Section` into an `ShpDataform`. */
export function fromSection(section, opts = {}) {
    const subjectHint = opts.subject ?? unmark(firstCellSubject(section)) ?? "section";
    const cells = [];
    for (const entry of section?.affirmed ?? [])
        cells.push(toToldCell(entry, subjectHint, "affirmed"));
    for (const entry of section?.contradicted ?? [])
        cells.push(toToldCell(entry, subjectHint, "contradicted"));
    for (const entry of section?.denied ?? [])
        cells.push(toToldCell(entry, subjectHint, "denied"));
    return carryOpts({ subject: opts.subject ?? subjectHint, cells }, opts);
}
/** Build an `ShpDataform` from a subject and cells already paired with their evidence. */
export function fromCells(subject, cells = [], opts = {}) {
    return carryOpts({ subject, cells }, opts);
}
/** Normalize a `DetectReport` into an `ShpDataform`. */
export function fromDetect(report, opts = {}) {
    const cells = (report.cells ?? []).map(({ span, rule, evidence }) => ({
        cell: { subject: spanId(span), predicate: rule.text, object: rule.severity },
        evidence,
    }));
    return carryOpts({ subject: opts.subject ?? "document", cells }, opts);
}
function carryOpts(dataform, opts) {
    if (opts.title !== undefined)
        dataform.title = opts.title;
    if (opts.observer !== undefined)
        dataform.observer = opts.observer;
    if (opts.metadata !== undefined)
        dataform.metadata = opts.metadata;
    if (opts.mode !== undefined)
        dataform.mode = opts.mode;
    if (opts.projection !== undefined)
        dataform.projection = opts.projection;
    return dataform;
}
function firstCellSubject(section) {
    for (const list of [section?.affirmed, section?.contradicted, section?.denied]) {
        for (const entry of list ?? []) {
            if (isToldCell(entry) && entry.cell.subject !== undefined)
                return entry.cell.subject;
        }
    }
    return undefined;
}
function toToldCell(entry, subject, section) {
    if (isToldCell(entry))
        return entry;
    const predicate = entry.predicate ?? null;
    const cell = entry.object === undefined
        ? { subject, predicate }
        : { subject, predicate, object: entry.object };
    if (section === "affirmed") {
        return { cell, evidence: toldEvidence({ for: witnesses(entry.citation) }) };
    }
    if (section === "denied") {
        return { cell, evidence: toldEvidence({ against: witnesses(entry.citation) }) };
    }
    return { cell, evidence: toldEvidence({ for: witnesses(entry.affirmedBy), against: witnesses(entry.deniedBy) }) };
}
function isToldCell(value) {
    return !!value && typeof value === "object" && "cell" in value && "evidence" in value;
}
function witnesses(value) {
    if (value === undefined || value === null)
        return [];
    return Array.isArray(value) ? value : [value];
}
function spanId(span) {
    return `${span.tier}@${span.start}-${span.end}`;
}
const keyOf = (predicate) => typeof predicate === "string" ? predicate : JSON.stringify(predicate ?? null);
const HTML_STRUCTURAL_CLASS = /^[A-Za-z][A-Za-z0-9_-]*$/u;
/** The default registry: class = slug(predicate); inverse returns the class. */
export function defaultMorphisms() {
    return {
        className: (predicate) => slug(predicate),
        predicate: (className) => className,
    };
}
/** A registry over an explicit class↔predicate vocabulary. */
export function morphismRegistry(morphisms) {
    const byPredicate = new Map();
    const byClass = new Map();
    for (const m of morphisms) {
        if (!HTML_STRUCTURAL_CLASS.test(m.className)) {
            throw new TypeError(`morphismRegistry: invalid structural class ${JSON.stringify(m.className)}`);
        }
        if (byClass.has(m.className)) {
            throw new TypeError(`morphismRegistry: duplicate structural class ${JSON.stringify(m.className)}`);
        }
        byPredicate.set(keyOf(m.predicate), m.className);
        byClass.set(m.className, m.predicate);
    }
    return {
        className: (predicate) => byPredicate.get(keyOf(predicate)) ?? slug(predicate),
        predicate: (className) => byClass.get(className) ?? className,
    };
}
/* ── project ────────────────────────────────────────────────────────────── */
/**
 * Project typed cells and all evidence into a reusable article.
 * @param dataform - Settled cells to project.
 * @param morphisms - Predicate class vocabulary.
 * @param options - Explicit reference routing.
 * @returns Finite HTML with lossless typed coordinates.
 */
export function projectArticle(dataform, morphisms = defaultMorphisms(), options = {}) {
    if (!dataform || typeof dataform !== "object") {
        throw new TypeError("project: dataform must be an object");
    }
    const subject = unmark(dataform.subject);
    if (subject === undefined || subject === null) {
        throw new TypeError("project: dataform.subject is required");
    }
    const cells = Array.isArray(dataform.cells) ? dataform.cells : [];
    const mode = dataform.mode === "audit" ? "audit" : "calm";
    const projection = dataform.projection === "negated" ? "negated" : "supported";
    const groups = [];
    for (const entry of cells) {
        if (!entry || !entry.cell) {
            throw new TypeError("project: each cell must be { cell: { subject, predicate, object? }, evidence }");
        }
        const key = unmark(entry.cell.subject) ?? null;
        const previous = groups.at(-1);
        if (previous && canonical(previous[0]) === canonical(key))
            previous[1].push(entry);
        else
            groups.push([key, [entry]]);
    }
    const sections = groups
        .map(([entity, entries]) => `    <section class="subject" data-e="${escapeAttr(entity)}">\n` +
        entries.map((entry) => renderSpan(entry, mode, projection, morphisms, options)).join("\n") +
        `\n    </section>`)
        .join("\n");
    const articleAttrs = [
        `class="semantic-hypertext-packet"`,
        `data-subject="${escapeAttr(subject)}"`,
        dataform.observer == null ? null : `data-observer="${escapeAttr(dataform.observer)}"`,
        `data-cells="${cells.length}"`,
        `data-mode="${escapeAttr(mode)}"`,
    ].filter(Boolean).join(" ");
    return `  <article ${articleAttrs}>
${sections}
  </article>`;
}
/**
 * Project a settled dataform into a finite packet document.
 * @param dataform - Settled cells and document metadata.
 * @param morphisms - Predicate class vocabulary.
 * @param options - Explicit reference routing.
 * @returns A self-contained HTML document.
 */
export function project(dataform, morphisms = defaultMorphisms(), options = {}) {
    const subject = unmark(dataform.subject);
    if (subject === undefined || subject === null) {
        throw new TypeError("project: dataform.subject is required");
    }
    const title = dataform.title ?? subject;
    const metaTags = Object.entries(dataform.metadata ?? {})
        .map(([key, value]) => `    <meta name="${escapeAttr(key)}" content="${escapeAttr(value)}">`)
        .join("\n");
    const article = projectArticle(dataform, morphisms, options);
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>${escapeText(title)}</title>${metaTags ? "\n" + metaTags : ""}
</head>
<body>
${article}
</body>
</html>
`;
}
/** The SHP projection. `shp` is the historical name for `project`. */
export const shp = project;
function renderSpan(entry, mode, projection, morphisms, options) {
    const { cell, evidence: e } = entry;
    if (!e || !Array.isArray(e.for) || !Array.isArray(e.against)) {
        throw new TypeError("project: each cell needs its evidence { for, against }");
    }
    const subject = unmark(cell.subject) ?? null;
    const predicate = unmark(cell.predicate) ?? null;
    const object = unmark(cell.object);
    const hasObject = cell.object !== undefined;
    const evidence = [e.for.map(witnessValue), e.against.map(witnessValue)];
    const [positive, negative] = sidesOf(e);
    const value = readingOf(e);
    const calm = calmReadingOf(e, projection);
    const glyph = readingMark(e);
    const contested = isContested(e);
    const attrs = [
        `class="${escapeAttr(morphisms.className(predicate))}"`,
        `data-e="${escapeAttr(subject)}"`,
        `data-a="${escapeAttr(predicate)}"`,
        hasObject ? `data-v="${escapeAttr(object ?? null)}"` : null,
        `data-e-json="${escapeAttr(canonical(cell.subject))}"`,
        `data-a-json="${escapeAttr(canonical(cell.predicate))}"`,
        hasObject ? `data-v-json="${escapeAttr(canonical(cell.object))}"` : null,
        `data-evidence="${escapeAttr(canonical(evidence))}"`,
        `data-positive="${positive}"`,
        `data-negative="${negative}"`,
        `data-value="${escapeAttr(value)}"`,
        `data-calm="${escapeAttr(calm)}"`,
        `data-mark="${escapeAttr(glyph)}"`,
        contested ? `data-contested="true"` : null,
    ].filter(Boolean).join(" ");
    const why = contested || mode === "audit" ? renderWhy(e, glyph) : "";
    const text = hasObject ? `${renderValue(predicate, options)} ${renderValue(object ?? null, options)}` : renderValue(predicate, options);
    return `      <span ${attrs}>${text}${why}</span>`;
}
function renderValue(value, options) {
    if (!isRef(value))
        return escapeText(value);
    const href = options.resolveHref?.(value.ref);
    if (href === undefined)
        return escapeText(value.ref);
    if (typeof href !== "string" || /[\u0000-\u0020\u007f]/u.test(href) || href.startsWith("//") || href.includes("\\") || !/^(?:https?:\/\/|[/?#]|[^:/?#]+(?:[/?#]|$))/iu.test(href)) {
        throw new TypeError("project: reference href must be an HTTP(S) or relative URL");
    }
    return `<a href="${escapeAttr(href)}" data-ref="${escapeAttr(value.ref)}">${escapeText(value.ref)}</a>`;
}
function renderWhy(e, glyph) {
    const positive = e.for.map(witnessValue);
    const negative = e.against.map(witnessValue);
    const list = (witnessList) => witnessList.length === 0 ? "<em>none recorded</em>" : witnessList.map((witness) => `<li>${escapeText(witness)}</li>`).join("");
    return `<details class="why" data-held="${escapeAttr(glyph)}">` +
        `<summary>why ${escapeText(glyph)}</summary>` +
        `<ul class="witnesses-positive" data-side="positive">${list(positive)}</ul>` +
        `<ul class="witnesses-negative" data-side="negative">${list(negative)}</ul>` +
        `</details>`;
}
function witnessValue(witness) {
    if (isHtmlValue(witness))
        return witness;
    throw new TypeError("project: witness is not HTML-projectable");
}
function isHtmlValue(value) {
    return isJsonValue(value) || isConstValue(value) || isRefValue(value);
}
function isRefValue(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        return false;
    if (Object.getPrototypeOf(value) !== Object.prototype)
        return false;
    return "ref" in value && typeof value.ref === "string";
}
function isConstValue(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        return false;
    if (Object.getPrototypeOf(value) !== Object.prototype)
        return false;
    return "const" in value && isJsonValue(value.const);
}
function isJsonValue(value) {
    if (value === undefined)
        return false;
    if (value === null)
        return true;
    const kind = typeof value;
    if (kind === "string" || kind === "boolean")
        return true;
    if (kind === "number")
        return Number.isFinite(value);
    if (kind !== "object")
        return false;
    if (Array.isArray(value))
        return value.every(isJsonValue);
    if (Object.getPrototypeOf(value) !== Object.prototype)
        return false;
    return Object.values(value).every(isJsonValue);
}
/* ── markup ─────────────────────────────────────────────────────────────── */
/**
 * Decode typed coordinates and evidence without evaluating scripts or syntax.
 * @param html - An untrusted packet document or article.
 * @returns The projected cells, each with its told evidence, in carrier order.
 * @throws {TypeError} When a cell has missing or inconsistent wire data.
 */
export function markup(html) {
    const cells = [];
    for (const { name: tagName, attrs } of scanHtmlStartTags(String(html))) {
        if (tagName !== "span" || attrs["data-e"] === undefined || attrs["data-a"] === undefined)
            continue;
        const coordinate = (key) => {
            const encoded = attrs[`data-${key}-json`];
            if (encoded === undefined)
                throw new TypeError(`markup: missing typed ${key} coordinate`);
            const value = parse(encoded);
            if (htmlText(unmark(value) ?? null) !== attrs[`data-${key}`])
                throw new TypeError(`markup: inconsistent ${key} coordinate`);
            return value;
        };
        const subject = coordinate("e");
        const predicate = coordinate("a");
        const hasObject = attrs["data-v-json"] !== undefined;
        if (!hasObject && attrs["data-v"] !== undefined)
            throw new TypeError("markup: missing typed v coordinate");
        const cell = hasObject ? { subject, predicate, object: coordinate("v") } : { subject, predicate };
        const side = (key) => {
            const value = attrs[key];
            if (value !== "true" && value !== "false")
                throw new TypeError("markup: invalid evidence side");
            return value === "true";
        };
        const name = readingOfSides("knowledge", side("data-positive"), side("data-negative"));
        if (attrs["data-value"] !== name)
            throw new TypeError("markup: inconsistent reading");
        const evidence = parse(attrs["data-evidence"] ?? "null");
        if (!Array.isArray(evidence) || evidence.length !== 2 || !evidence.every(Array.isArray))
            throw new TypeError("markup: invalid evidence pair");
        // A settled value may differ from witness presence after a bilattice
        // operation. Retain both the supplied value and every witness.
        const e = toldEvidence({ for: evidence[0], against: evidence[1], value: name });
        cells.push({ cell, evidence: e });
    }
    return cells;
}
/**
 * Project an immutable packet committed over every declared field.
 * @param dataform - Settled cells and presentation metadata.
 * @param decl - Source, settlement, projection evidence, routing and optional syntax.
 * @returns A canonical SHA-256 addressed packet with inert JavaScript syntax.
 */
export function pack(dataform, decl) {
    let html = decl.renderDocument
        ? decl.renderDocument(projectArticle(dataform, decl.morphisms, decl))
        : project(dataform, decl.morphisms, decl);
    if (decl.syntax !== undefined) {
        if (typeof decl.syntax !== "string")
            throw new TypeError("pack: syntax must be JavaScript source text");
        const syntax = decl.syntax;
        if (!/<\/body\s*>/iu.test(html))
            throw new TypeError("pack: syntax requires a document body");
        html = html.replace(/<\/body\s*>/iu, (closing) => `<template data-shp-syntax="javascript">${escapeText(syntax)}</template>\n${closing}`);
    }
    if (canonical(markup(html).map(toldCellContent)) !== canonical(dataform.cells.map(toldCellContent)))
        throw new TypeError("pack: document must preserve typed cells and evidence");
    const fields = {
        kind: "shp.packet",
        source: decl.source,
        frontier: dataform.cells.map(({ cell }) => cellKey(cell)),
        settlement: decl.settlement ?? null,
        projection: decl.projection ?? "shp.project/2",
        html,
        evidence: decl.evidence ?? null,
    };
    const snapshot = JSON.parse(canonical(fields));
    const packet = deepFreeze({ ...snapshot, identity: address(canonical(snapshot)) });
    if (!verifyPacket(packet))
        throw new TypeError("pack: document must preserve the packet frontier and inspection safety");
    return packet;
}
/**
 * Verify the complete packet's canonical content address.
 * @param packet - Untrusted packet value.
 * @returns Whether schema, complete field commitment and HTML coordinates agree.
 */
export function verifyPacket(packet) {
    try {
        if (!isJsonValue(packet) || packet === null || Array.isArray(packet) || typeof packet !== "object")
            return false;
        const fields = packet;
        if (Object.keys(fields).sort().join(",") !== "evidence,frontier,html,identity,kind,projection,settlement,source")
            return false;
        const { identity, ...content } = fields;
        if (content.kind !== "shp.packet" || typeof content.html !== "string" || typeof content.projection !== "string" || !Array.isArray(content.frontier) || !content.frontier.every((item) => typeof item === "string"))
            return false;
        return identity === address(canonical(content))
            && validateShpDocumentBytes(content.html).length === 0
            && /<article\b[^>]*\bclass="semantic-hypertext-packet"/u.test(content.html)
            && canonical(content.frontier) === canonical(markup(content.html).map(({ cell }) => cellKey(cell)));
    }
    catch {
        return false;
    }
}
/**
 * Render a verified packet; activation is an explicit JavaScript effect boundary.
 * @param packet - A packet whose identity and frontier must verify.
 * @param options - Set executeJavaScript only when this renderer authorizes execution.
 * @returns HTML; syntax remains inert unless activation is explicitly requested.
 * @throws {TypeError} On integrity failure or source unsafe for an inline module.
 */
export function renderPacket(packet, options = {}) {
    if (!verifyPacket(packet))
        throw new TypeError("renderPacket: invalid packet identity or frontier");
    return packet.html.replace(/<template data-shp-syntax="javascript">([\s\S]*?)<\/template>/g, (whole, encoded) => {
        if (options.executeJavaScript !== true)
            return whole;
        const source = decodeHtmlEntities(encoded);
        if (/<\/script[\s/>]/iu.test(source) || /<!--/u.test(source))
            throw new TypeError("renderPacket: syntax cannot be embedded as an inline module");
        return `<script type="module">${source}</script>`;
    });
}
/**
 * Compute the exact typed cell coordinate identity, preserving absent objects.
 * @param cell - Cell coordinates.
 * @returns RFC 8785 canonical coordinates.
 */
export function cellKey(cell) {
    const fields = {};
    for (const key of ["subject", "predicate", "object"])
        if (cell[key] !== undefined)
            fields[key] = cell[key];
    return canonical(fields);
}
/**
 * Commit UTF-8 content using the shared cryptographic owner.
 * @param content - Exact content bytes represented as a string.
 * @returns A SHA-256 content address.
 */
export function address(content) {
    return `sha256:${sha256Bytes(new TextEncoder().encode(content))}`;
}
function deepFreeze(value) {
    if (value !== null && typeof value === "object") {
        for (const child of Object.values(value))
            deepFreeze(child);
        Object.freeze(value);
    }
    return value;
}
function toldCellContent({ cell, evidence: e }) {
    return { cell, reading: readingOf(e), evidence: [e.for.map(witnessValue), e.against.map(witnessValue)] };
}
/** Lint an HTML string against the SHP packet-safety and RFC 7992 rules. */
export function lint(html) {
    const violations = [];
    const fail = (rule, severity, message) => {
        violations.push({ rule, severity, message });
    };
    const src = String(html);
    if (!/^\s*<!DOCTYPE html>/i.test(src)) {
        fail("rfc7992.doctype", "error", "document must begin with <!DOCTYPE html>");
    }
    if (!/<html\b[^>]*\slang=["']en["']/i.test(src)) {
        fail("rfc7992.lang", "error", '<html> must declare lang="en"');
    }
    if (!/<meta\b[^>]*\scharset=["']utf-8["']/i.test(src)) {
        fail("rfc7992.charset", "error", '<head> must declare <meta charset="utf-8">');
    }
    if (/<script[\s>]/i.test(src)) {
        fail("rfc7992.self-contained", "error", "document must not contain a <script> element");
    }
    if (/<style[\s>]/i.test(src)) {
        fail("rfc7992.self-contained", "error", "document must not contain a <style> element");
    }
    if (/<link\b[^>]*\srel=["']stylesheet["']/i.test(src)) {
        fail("rfc7992.self-contained", "error", "document must not link an external stylesheet");
    }
    if (/\ssrc=["']?(?!data:)[^"'\s>]+/i.test(src)) {
        fail("rfc7992.self-contained", "error", "document must not reference an external src");
    }
    if (/\son[a-z]+\s*=\s*["']/i.test(src)) {
        fail("rfc7992.self-contained", "error", "document must not contain inline event handlers");
    }
    if (/\r/.test(src)) {
        fail("rfc7992.line-endings", "error", "document must use LF line endings");
    }
    if (!/class="semantic-hypertext-packet"/.test(src)) {
        fail("shp.root", "error", "document must carry the article.semantic-hypertext-packet root");
    }
    for (const tag of src.match(/<span\b[^>]*>/gi) ?? []) {
        if (!/\sclass="[^"]+"/.test(tag)) {
            fail("shp.span-class", "error", `span carries no predicate class: ${tag}`);
        }
        if (!/\sdata-e="/.test(tag) || !/\sdata-a="/.test(tag)) {
            fail("shp.span-carrier", "warning", `span carries no e/a carrier elements: ${tag}`);
        }
    }
    for (const match of src.matchAll(/\sclass=(?:"([^"]*)"|'([^']*)')/gi)) {
        for (const token of (match[1] ?? match[2] ?? "").split(/\s+/).filter(Boolean)) {
            if (!HTML_STRUCTURAL_CLASS.test(token)) {
                fail("shp.class-name", "error", `class token is not a structural morphism identity: ${token}`);
            }
        }
    }
    return { violations };
}
/** RFC 7992 structural classes — its <span class> morphism identities. */
export const RFC7992_CLASSES = ["bcp14", "xref", "eref", "relref", "selfRef", "artwork", "sourcecode"];
/** The RFC 7992 inhabitant profile. */
export const rfc7992Profile = Object.freeze({
    name: "rfc7992",
    classes: RFC7992_CLASSES,
    lint,
});
/* ── carrier / document-render engine + CSS style resolution (re-exported) ─
 * Moved out to @red-cup-engineering/css-services-section (the CSS
 * cascade closure and certification) and
 * @red-cup-engineering/html-document-render-service (the carrier +
 * document-render engine, which depends on css-services-section by
 * package name), each re-exported here unchanged so this package's export
 * surface stays identical. The SHP codec, lint, and escaping below stay here.
 */
export { resolveNodeStyles, checkStyleResolutionSettled, checkClassMapsValid, cssTextFromResolvedStyles, } from "@red-cup-engineering/css-services-section/css-style-resolution";
export { htmlCarrierOf, buildHtmlDocumentPlan, renderHtmlDocument, } from "@red-cup-engineering/html-engineering-services-section/html-document-render";
/** The html codec as a holography projector over cells paired with their told evidence. */
/** The HTML codec as a holography projector over charged cells. */
export const htmlProjector = defineResourceProjector({
  type: "shp.html",
  corner: "assertion",
  rung: "strict",
  recognize: (resource) => /class="semantic-hypertext-packet"/.test(resource.content),
  read: (resource) => markup(resource.content),
  write: (cells) => project(fromCells("packet", cells)),
});
