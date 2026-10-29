import { AUDIT, PUBLIC, algebraToPage, projectArticle, projectDocument, stack } from "./semantic-pages.mjs";
export function unmark(value) {
    return value && typeof value === "object" && "const" in value ? value.const : value;
}
function firstWitness(value) {
    const list = Array.isArray(value) ? value : [];
    for (const witness of list){
        const bare = unmark(witness);
        if (bare !== undefined && bare !== null) return bare;
    }
    return null;
}
export function chargeBits(charge) {
    const value = Array.isArray(charge?.value) ? charge.value : [];
    return Object.freeze([
        Boolean(value[0]),
        Boolean(value[1])
    ]);
}
function sideEvidence(charge, side) {
    const evidence = Array.isArray(charge?.evidence) ? charge.evidence : [];
    return firstWitness(evidence[side]);
}
function projectedBase(cell) {
    const subject = unmark(cell.subject);
    return {
        subject: subject === undefined || subject === null ? null : String(subject),
        predicate: unmark(cell.predicate),
        object: unmark(cell.object)
    };
}
export function sectionToAlgebra(section) {
    const assignments = Array.isArray(section.assignments) ? section.assignments : [];
    const subjects = new Set();
    const potential = [];
    const active = [];
    const stable = [];
    const absurd = [];
    for (const assignment of assignments){
        const base = projectedBase(assignment.cell ?? {});
        if (base.subject) subjects.add(base.subject);
        const [positive, negative] = chargeBits(assignment.charge);
        const cellBase = {
            subject: base.subject,
            predicate: String(base.predicate ?? ""),
            object: base.object
        };
        if (positive && negative) {
            stable.push(Object.freeze({
                ...cellBase,
                claimedBy: sideEvidence(assignment.charge, 0),
                contraryClaimedBy: sideEvidence(assignment.charge, 1)
            }));
        } else if (positive) {
            potential.push(Object.freeze({
                ...cellBase,
                citation: sideEvidence(assignment.charge, 0)
            }));
        } else if (negative) {
            active.push(Object.freeze({
                ...cellBase,
                citation: sideEvidence(assignment.charge, 1)
            }));
        } else {
            absurd.push(Object.freeze(base));
        }
    }
    const subjectList = [
        ...subjects
    ].sort();
    return Object.freeze({
        kind: "web-swarm.settled-section",
        subject: subjectList.length > 0 ? subjectList[0] : null,
        potential: Object.freeze(potential),
        active: Object.freeze(active),
        stable: Object.freeze(stable),
        absurd: Object.freeze(absurd),
        multiSubject: subjectList.length > 1
    });
}
function withoutSubject(cell) {
    const out = {
        predicate: cell.predicate,
        object: cell.object
    };
    if (cell.citation !== undefined) out.citation = cell.citation;
    if (cell.claimedBy !== undefined) out.claimedBy = cell.claimedBy;
    if (cell.contraryClaimedBy !== undefined) out.contraryClaimedBy = cell.contraryClaimedBy;
    return Object.freeze(out);
}
function cellsForSubject(cells, subject) {
    return Object.freeze(cells.filter((cell)=>(cell.subject ?? subject) === subject).map(withoutSubject));
}
export function sectionToPage(section, options = {}) {
    const algebra = sectionToAlgebra(section);
    const subjects = [
        ...new Set([
            ...algebra.potential.map((cell)=>cell.subject).filter((subject)=>!!subject),
            ...algebra.active.map((cell)=>cell.subject).filter((subject)=>!!subject),
            ...algebra.stable.map((cell)=>cell.subject).filter((subject)=>!!subject)
        ])
    ].sort();
    const concreteSubjects = subjects.length > 0 ? subjects : [
        algebra.subject ?? "swarm"
    ];
    const pages = concreteSubjects.map((subject)=>algebraToPage({
            subject,
            potential: cellsForSubject(algebra.potential, subject),
            active: cellsForSubject(algebra.active, subject),
            stable: cellsForSubject(algebra.stable, subject)
        }, options));
    const page = pages.length === 1 ? pages[0] : stack(pages, {
        subject: algebra.subject
    });
    return Object.freeze({
        ...page,
        absurd: algebra.absurd
    });
}
function renderContexts(options) {
    if (options.contexts) return options.contexts;
    return options.mode === "audit" ? Object.freeze([
        PUBLIC,
        AUDIT
    ]) : undefined;
}
function renderContextName(contextName, options) {
    return options.mode === "audit" && contextName === "public" && !options.contexts ? "audit" : contextName;
}
function pageOptions(contexts) {
    return contexts ? {
        contexts
    } : {};
}
export function renderArticle(section, contextName = "public", options = {}) {
    const page = sectionToPage(section, pageOptions(renderContexts(options)));
    const renderOptions = {};
    if (options.mode) renderOptions.mode = options.mode;
    if (options.observer) renderOptions.observer = options.observer;
    return projectArticle(page, renderContextName(contextName, options), renderOptions);
}
export function renderDocument(section, contextName = "public", options = {}) {
    const page = sectionToPage(section, pageOptions(renderContexts(options)));
    const renderOptions = {};
    if (options.title) renderOptions.title = options.title;
    if (options.mode) renderOptions.mode = options.mode;
    if (options.observer) renderOptions.observer = options.observer;
    return projectDocument(page, renderContextName(contextName, options), renderOptions);
}
export function renderSectionFrame(section, options = {}) {
    const contextName = options.contextName ?? "public";
    const auditContextOptions = {
        mode: "audit"
    };
    if (options.contexts) auditContextOptions.contexts = options.contexts;
    const page = sectionToPage(section, pageOptions(renderContexts(auditContextOptions)));
    const frameOptions = {};
    if (options.mode) frameOptions.mode = options.mode;
    const html = projectArticle(page, renderContextName(contextName, options), frameOptions);
    const audit = options.mode === "audit" ? html : projectArticle(page, renderContextName(contextName, auditContextOptions), {
        mode: "audit"
    });
    return Object.freeze({
        html,
        audit,
        absurd: page.absurd
    });
}
