# HTML structural projection and reading

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

The generic SHP packet boundary follows the existing
[canonical SHP source-language contract](https://github.com/red-cup-engineering/semiotic-hypertext-packet/pull/4):
a source may declare one canonical BCP 47 document language, or leave it unknown.
`project` and `pack` no longer invent `lang="en"` for an unqualified source;
an explicitly authored `dataform.language` may not be replaced by a conflicting
renderer option. `verifyPacket` accepts a genuinely unlabelled root or a
canonical authored tag and retains its original HTML safety checks. The
specific RFC 7992 **English-only RFC document** inhabitant declaration is
unchanged; it is not a universal SHP language rule. The old HTML structural
packet codec and the newer canonical SHP package have distinct
cell/charge/packet contracts: this does **not** claim drop-in compatibility,
npm release, translation, accessibility conformance, or authorization to
render private content. Original bytes determine packet identity; consumers
must select a verified released package and requalify their original source.

The root export retains the existing SHP cell/evidence projection, packet commitment and receiving APIs. `./document-nodes` and `./string-rendering` retain their actual string/node construction contracts. Their common `./lexical` helpers retain carriage returns through HTML receiving without changing normal escaped output. HTML NUL display becomes U+FFFD while original typed SHP coordinates/evidence remain in canonical JSON fields; receiving compares the HTML display separately from the exact original values. HTML data attributes are parsed once; Webmention no longer decodes them again. The former five-entity decoder, attribute regex, first-greater-than scanner and duplicate escaping/unescaping implementations are removed.

`./scan` uses native parse5 8.0.1 with source positions. `readHtmlDocument` returns the native parsed document, without executing scripts or fetching. `scanHtmlStartTags` returns frozen explicit-element rows `{name,attrs,index}` in source order, excluding script/style/template bodies. Attribute entities are already decoded using HTML rules, duplicate attributes retain their first value, implied elements have no row, and native tree correction can discard source tags. Indices are zero-based UTF-16 code units in the original input. `decodeHtmlEntities(value,context)` uses native entities 8.1.0 with text(default) or attribute context, including numeric replacement and semicolon rules.

`./transformations` exports six functions:

- `decodeHtmlEntityText({text,context?})`: one-pass reference decoding, not markup parsing.
- `encodeHtmlEntityText({text})`: ASCII character-reference encoding that roundtrips through text-context decoding. NUL/ill-formed Unicode refuse; CR is retained through references. This does not encode raw JavaScript/CSS or sanitize HTML.
- `htmlToJsonTree({html})`: parsed ordered document nodes, document mode, doctype IDs, namespaces/attributes, comments/text, source spans and separate inert template fragment content. Implied nodes have null spans; parser recovery differs from lexical source.
- `htmlParsingDiagnostics({html})`: native parsing error codes with source positions and mode. At most64 diagnostic entries plus the total observed count; not a complete conformance/accessibility/security validator.
- `htmlDocumentLinks({html,documentUrl?})`: explicit parsed a/area/link hrefs in source order, decoded once, with rel tokens and URL resolution from the first base href and optional absolute HTTP(S) document URL. Unresolved URLs are null; other schemes remain data. No navigation, network fetch or URL safety inference.
- `htmlBodyText({html})`: body text nodes in DOM order, original spans and their direct concatenation. Head/script/style/template/noscript content is excluded. No CSS visibility/layout or invented paragraph separators.

All operations require well-formed Unicode inputs up to65536 UTF-8 bytes. Document operations cap8192 parsed nodes/attributes and depth64, including implied nodes and template fragments. Results cap1048576 JSON UTF-8 bytes; seller requests separately cap1048576 bytes. Parsing uses scripting-enabled tree rules while never executing scripts. Parsing errors and unresolved URLs are truthful paid information; unsupported request fields and resource/representation limits refuse before payment.

The qualified fixtures retain2231 primary WHATWG named references and50 selected standalone HTML5lib document trees at the supplier's pinned test revision, with source attribution/license. The historical tree subset is not full current HTML conformance. Existing actual SHP/HTML and Webmention authoring consumers were exercised; this does not establish every hosted consumer or a standalone registry release.

## Native prerequisite receiving

Native HTML parsing and source projection use parse5 and entities. The source
codec retains exact UTF-8 source custody and native tree recovery, including a
separate doctype node and the HTML element. Consumers must discriminate `kind`
as well as `name`: both the doctype and root element can have the name `html`.

The package ships its original structural, settled-carrier, safe-profile and
source-reader consumer suites as declared receiving tests. Runtime parsing,
rendering and mathematical suppliers are unchanged in this development cohort.
The native PNPM lock selects the current declared supplier identities instead
of workspace links; no local-file dependency or replacement parser is used.

This is a prerequisite preview. Authentic local archive qualification is not
registry issuance or live activation. Held upstream approvals and issuance
checks remain independent requirements before activation of downstream systems.
