/**
 * SignCraft pages as hypertext: a page's selected cells rendered as an HTML
 * article or document under a vantage, and a native SignCraft settlement packed
 * as a content-committed SHP packet. Moved from SignCraft's page module; the
 * page itself (a Chu space of cells under vantages) stays in SignCraft.
 */
import { AUDIT, PUBLIC, VALUE_MARK, pageOfCells, selectForContext } from "@red-cup-engineering/signcraft/page";
import { evidenceOf, knowledgeReading, semanticId, triple } from "@red-cup-engineering/signcell/cell";
import { isConsistentReading, knowledgeBottom, samePoint } from "@red-cup-engineering/metrologic/four";
import { escapeAttr, escapeText, slug, fromCells as shpFromCells, pack as shpPack } from "./index.mjs";

const label = (value) => typeof value === "string" ? value : value === undefined || value === null ? "" : JSON.stringify(value);

function witnesses(values) {
  return values.length === 0 ? "<em>none recorded</em>" : values.map((entry) => `<li>${escapeText(label(entry))}</li>`).join("");
}

function renderSpan(entry, mode) {
  const { cell } = entry;
  const reading = knowledgeReading(cell), mark = VALUE_MARK[reading];
  const predicate = label(cell.predicate), subject = label(cell.subject);
  const hasObject = cell.object !== undefined && cell.object !== null && cell.object !== "";
  const attrs = [`class="${escapeAttr(slug(predicate))}"`, `data-e="${escapeAttr(subject)}"`, `data-a="${escapeAttr(predicate)}"`,
    hasObject ? `data-v="${escapeAttr(label(cell.object))}"` : "", !isConsistentReading(reading) ? `data-contested="true"` : ""].filter(Boolean).join(" ");
  const why = !isConsistentReading(reading) || mode === "audit"
    ? `<details class="why" data-value="${escapeAttr(mark)}"><summary>why ${escapeText(mark)}</summary><ul class="witnesses-truth" data-side="truth">${witnesses([...cell.for])}</ul><ul class="witnesses-falsity" data-side="falsity">${witnesses([...cell.against])}</ul></details>`
    : "";
  return `      <span ${attrs}>${escapeText(hasObject ? `${predicate} ${label(cell.object)}` : predicate)}${why}</span>`;
}

/** The article a vantage reads of a page: one section per subject, one span per selected cell. */
export function renderArticle(page, contextName = "public", options = {}) {
  const mode = options.mode === "audit" ? "audit" : "calm";
  const selected = selectForContext(page, contextName);
  if (selected.length === 0) return "";
  const groups = new Map();
  for (const entry of selected) groups.set(label(entry.cell.subject), [...(groups.get(label(entry.cell.subject)) ?? []), entry]);
  const body = [...groups].map(([subject, entries]) => `    <section class="subject" data-e="${escapeAttr(subject)}">\n${entries.map((entry) => renderSpan(entry, mode)).join("\n")}\n    </section>`).join("\n");
  // Never disclose a subject from the unfiltered page when the selected
  // vantage sees only other subjects. Caller-provided page.subject is metadata,
  // not a visibility override.
  const visibleSubject = page.subject !== null && selected.some((entry) => label(entry.cell.subject) === label(page.subject))
    ? label(page.subject) : null;
  const attrs = [`class="semantic-hypertext-packet"`, visibleSubject === null ? "" : `data-subject="${escapeAttr(visibleSubject)}"`,
    options.observer === undefined ? "" : `data-observer="${escapeAttr(options.observer)}"`, `data-cells="${selected.length}"`, `data-mode="${mode}"`].filter(Boolean).join(" ");
  return `  <article ${attrs}>\n${body}\n  </article>`;
}

/** A whole HTML document of the article a vantage reads. */
export function renderDocument(page, contextName = "public", options = {}) {
  // Only the subjects this vantage may actually read can determine the
  // implicit document title. A hidden-only page must not disclose a source
  // name through <title> merely because its article is empty.
  const selectedSubjects = [...new Set(selectForContext(page, contextName).map((entry) => label(entry.cell.subject)))];
  const title = options.title ?? (selectedSubjects.length === 1 ? selectedSubjects[0] : "semantic-hypertext");
  const article = renderArticle(page, contextName, options) || `  <p class="empty">No cells selected.</p>`;
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="utf-8">\n    <title>${escapeText(title)}</title>\n</head>\n<body>\n${article}\n</body>\n</html>\n`;
}

/** A section's calm article beside its audit, with unknown cells visible
 * under the selected context. Unknowns must not bypass that context's
 * visibility predicate when returned as a separate readout.
 */
export function renderSectionFrame(cells, options = {}) {
  const page = pageOfCells(cells, { contexts: options.contexts ?? [PUBLIC, AUDIT] });
  const contextName = options.contextName ??
    (options.mode === "audit" && options.contexts === undefined ? "audit" : "public");
  const html = renderArticle(page, contextName, options.mode ? { mode: options.mode } : {});
  const audit = options.mode === "audit" ? html : renderArticle(page, "audit", { mode: "audit" });
  const viewing = page.contexts.find((ctx) => ctx.name === contextName);
  const absurd = Object.freeze([...page.cells.values()].filter((at) =>
    viewing?.visible(at) && samePoint(knowledgeReading(at), knowledgeBottom())));
  return Object.freeze({ html, audit, absurd });
}

/**
 * Construct a real, content-committed SHP packet from a native SignCraft
 * settlement and its visible Chu context. The current JSON/HTML SHP owner,
 * not SignCraft's legacy article renderer, owns typed coordinate round trips,
 * its packet frontier and its document digest.
 *
 * Visibility is applied BEFORE packing. Public/calm excludes negative-only
 * or unknown readings; audit retains all visible cells but supplies no
 * authorization to disclose them. Source identity names the seed content,
 * not the authenticity or powers of an issuer.
 */
export function packetOfSettlement(settlement, options = {}) {
  if (settlement?.kind !== "signcraft.settlement" ||
      !Array.isArray(settlement.stages) || !Array.isArray(settlement.settled) ||
      !Array.isArray(settlement.stages[0]?.valuation))
    throw new TypeError("packetOfSettlement: a native settlement is required");
  const mode = options.mode === "audit" ? "audit" : "calm";
  const contexts = options.contexts ?? [mode === "audit" ? AUDIT : PUBLIC];
  const contextName = options.contextName ?? (mode === "audit" ? "audit" : "public");
  const page = pageOfCells(settlement.settled, { contexts, subject: options.subject });
  const entries = selectForContext(page, contextName);
  const cells = entries.map(({ cell }) => Object.freeze({
    cell: triple(cell), evidence: evidenceOf(cell),
  }));
  const sourceId = semanticId(settlement.stages[0].valuation);
  const form = shpFromCells(options.subject ?? "l-space", cells, { mode });
  return shpPack(form, {
    source: Object.freeze({ kind: "signcraft.lspace.seed", id: sourceId }),
    settlement: Object.freeze({
      id: semanticId(settlement.settled),
      settledAt: settlement.settledAt,
      regime: settlement.regime,
    }),
    evidence: Object.freeze({
      observationCutoff: options.observationCutoff ?? null,
      visibleCells: entries.length,
    }),
  });
}
