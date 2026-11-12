import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { sidesOfReading } from "@red-cup-engineering/metrologic/four";
import { evidence } from "@red-cup-engineering/signcell/cell";
import { canonical } from '@red-cup-engineering/json-services-section';
import { address, cellKey, fromCells, fromSection, markup, morphismRegistry, pack, project, ref, renderPacket, verifyPacket } from '../src/html/index.mjs';
import { validateShpDocumentBytes } from '../src/html/shp-profile.mjs';

const form = () => fromSection({ affirmed: [{ predicate: 'depends-on', object: ref('object:2'), citation: { feed: 'source:1', row: 8 } }] }, { subject: 'object:1' });



test('SHP morphisms refuse ambiguous canonical predicate mappings', () => {
  const original = { predicate: 'reuses', scope: { a: 1, b: 2 } };
  const reordered = { scope: { b: 2, a: 1 }, predicate: 'reuses' };
  assert.throws(
    () => morphismRegistry([
      { className: 'firstClass', predicate: original },
      { className: 'secondClass', predicate: reordered },
    ]),
    /duplicate canonical predicate identity/,
  );
  assert.throws(
    () => morphismRegistry([
      { className: 'firstClass', predicate: 'exact' },
      { className: 'secondClass', predicate: 'exact' },
    ]),
    /duplicate canonical predicate identity/,
  );
  assert.throws(
    () => morphismRegistry([
      { className: 'sameClass', predicate: original },
      { className: 'sameClass', predicate: 'distinct' },
    ]),
    /duplicate structural class/,
  );
});

test('SHP morphisms preserve canonical typed predicate identity without scalar/record collisions', () => {
  const record = { kind: 'predicate', labels: { b: 2, a: 1 } };
  const reordered = { labels: { a: 1, b: 2 }, kind: 'predicate' };
  const asText = JSON.stringify(record);
  const registry = morphismRegistry([
    { className: 'typedPredicate', predicate: record },
    { className: 'textPredicate', predicate: asText },
  ]);
  assert.equal(registry.className(record), 'typedPredicate');
  assert.equal(registry.className(reordered), 'typedPredicate');
  assert.equal(registry.className(asText), 'textPredicate');
  assert.deepEqual(registry.predicate('typedPredicate'), record);
  assert.equal(registry.predicate('textPredicate'), asText);
  const cells = [{ cell: { subject: 's', predicate: reordered, object: 'v' }, evidence: evidence({ for: ['w'] }) }];
  const html = project(fromCells('packet', cells), registry);
  assert.match(html, /<span class="typedPredicate"/);
  assert.deepEqual(markup(html)[0].cell.predicate, reordered);
});

test('typed coordinates and both witness sides round-trip in calm and audit modes', () => {
  const values = [null, '', 0, 1.25, false, true, ['x', 2], { z: 3, a: '&<"' }, 'shp-ref:literal', ref('object:3'), { const: 4 }];
  for (const mode of ['calm', 'audit']) {
    for (const stance of ['absurd', 'potential', 'active', 'stable']) {
      const cells = values.map((value, i) => ({
        cell: { subject: values[(i + 1) % values.length], predicate: value, object: value },
        evidence: evidence({ for: values, against: [...values].reverse() }),
      }));
      const [positive, negative] = sidesOfReading(stance);
      cells.push({
        cell: { subject: 's', predicate: 'no-object' },
        evidence: evidence({ for: positive ? [stance] : [], against: negative ? [stance] : [] }),
      });
      const dataform = fromCells('packet', cells, { mode });
      assert.deepEqual(JSON.parse(JSON.stringify(markup(project(dataform)))), JSON.parse(JSON.stringify(cells)));
    }
  }
  assert.notEqual(cellKey({ subject: 's', predicate: 'p' }), cellKey({ subject: 's', predicate: 'p', object: null }));
});

test('reference resolver emits normal escaped links while preserving exact reference identity', () => {
  const html = project(form(), undefined, { resolveHref: id => '/objects?id=' + encodeURIComponent(id) + '&view=full' });
  assert.match(html, /<a href="\/objects\?id=object%3A2&amp;view=full" data-ref="object:2">object:2<\/a>/);
  assert.deepEqual(markup(html), form().cells);
  for (const href of ['javascript:alert(1)', 'data:text/html,test', '//other.test', '\\other.test', 'java\nscript:run()', 'ftp://example.test']) {
    assert.throws(() => project(form(), undefined, { resolveHref: () => href }), /reference href/);
  }
});

test('packet commits all fields with shared RFC 8785 and SHA-256 and freezes its own snapshot', () => {
  const source = { z: 2, a: 1 };
  const packet = pack(form(), { source, settlement: { accepted: true }, evidence: ['witness:1'] });
  const { identity, ...fields } = packet;
  assert.equal(identity, 'sha256:' + createHash('sha256').update(canonical(fields), 'utf8').digest('hex'));
  assert.equal(address('abc'), 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(verifyPacket(packet), true);
  assert.deepEqual(pack(form(), { source: { a: 1, z: 2 }, settlement: { accepted: true }, evidence: ['witness:1'] }), packet);
  source.a = 99;
  assert.equal(packet.source.a, 1);
  assert.equal(Object.isFrozen(packet.source), true);
  for (const key of ['source', 'settlement', 'evidence', 'projection', 'frontier', 'html']) {
    assert.equal(verifyPacket({ ...packet, [key]: 'tampered' }), false, key);
  }
  for (const declaration of [{ source: 'different' }, { source, settlement: false }, { source, evidence: false }, { source, syntax: 'void 0;' }]) {
    assert.notEqual(pack(form(), declaration).identity, packet.identity);
  }
});

test('source language or unknown survives the original packet writer and strict receiver', () => {
  // The canonical SHP owner already admits source-authored BCP 47 tags;
  // generic HTML Structural Projection must not reintroduce RFC 7992 English.
  const unknown = project(form());
  assert.match(unknown, /^<!DOCTYPE html>\n<html>\n/u);
  assert.doesNotMatch(unknown, /<html[^>]*lang=/u);
  assert.deepEqual(validateShpDocumentBytes(unknown), []);
  const unknownPacket = pack(form(), { source: 'source:unknown' });
  assert.equal(verifyPacket(unknownPacket), true);
  assert.match(unknownPacket.html, /<html>/u);
  assert.deepEqual(markup(unknownPacket.html), form().cells);
  for (const language of ['lkt', 'ar', 'fr-CA', 'zh-Hant', 'und', 'en']) {
    const fromSource = fromCells('object:1', form().cells, { language });
    const before = structuredClone(fromSource);
    const html = project(fromSource);
    assert.match(html, new RegExp('<html lang="' + language + '">', 'u'));
    assert.deepEqual(validateShpDocumentBytes(html), [], 'safe source-declared ' + language);
    const packet = pack(fromSource, { source: 'source:real:' + language });
    assert.equal(verifyPacket(packet), true);
    assert.deepEqual(markup(packet.html), fromSource.cells);
    assert.deepEqual(fromSource, before, 'projection may not alter original language testimony');
    assert.equal(packet.html.includes('lang="' + language + '"'), true);
  }
  assert.notEqual(pack(form(), {source:'source:1'}).identity,
    pack(form(), {source:'source:1', language:'lkt'}).identity,
    'original language choice changes immutable packet bytes and committed identity');
});

test('source language refuses conflict, noncanonical tags, forged roots and unsafe HTML', () => {
  const original = fromCells('object:1', form().cells, {language:'ar'});
  assert.throws(() => project(original, undefined, {language:'en'}), /conflicts with source-declared language/u);
  assert.doesNotThrow(() => project(original, undefined, {language:'ar'}));
  for (const language of ['en-us','AR','fr_CA','en--US','en ','','x-test','en<script','zh-hans']) {
    assert.throws(() => fromCells('object:1', form().cells, {language}), /canonical BCP 47/u);
    assert.throws(() => project(form(), undefined, {language}), /canonical BCP 47/u);
  }
  const accepted = project(form());
  assert.deepEqual(validateShpDocumentBytes(accepted), [],
    'one genuine source-authored HTML root remains valid');
  // Parse5's corrected DOM must not hide additional explicit source tokens.
  // The HTML tree builder merges the second root's language into the first
  // DOM element: count the actual start tags rather than constructed nodes.
  for (const duplicate of ['<html lang="ar">', '<HTML lang="lkt">']) {
    const forged = accepted.replace('<body>', '<body>\n' + duplicate);
    assert.ok(validateShpDocumentBytes(forged).some(({ code }) => code === 'SHP-DOC-003'),
      'a second explicit HTML root must be refused, not normalized: ' + duplicate);
  }
  // The root language must come from the explicit parsed HTML root, not
  // a comment, nested element or script text.
  assert.deepEqual(validateShpDocumentBytes(
    accepted.replace('<head>', '<head><!-- <html lang="en"> --><meta name="fake" lang="fr">')), []);
  assert.ok(validateShpDocumentBytes(
    accepted.replace('<html>', '<html lang="en-us">')
  ).some(violation=>violation.code==='SHP-DOC-003'));
  assert.ok(validateShpDocumentBytes(
    accepted.replace('<html>', '<html lang="">')
  ).some(violation=>violation.code==='SHP-DOC-003'));
  assert.ok(validateShpDocumentBytes(
    accepted.replace('</body>', '<script>alert(1)</script></body>')
  ).some(violation=>violation.code==='SHP-DOC-005'),
  'the source-language repair must not relax SHP inspection safety');
  const historical = accepted.replace('<html>', '<html lang="en">');
  assert.deepEqual(validateShpDocumentBytes(historical), [],
    'previous generic SHP packets with explicit English remain readable');
});

test('SHP inspection demands real parser attributes, not comment-forged packet evidence', () => {
  const valid = project(form());
  assert.deepEqual(validateShpDocumentBytes(valid), [], 'the original good packet is still accepted');
  const invalid = [
    ['SHP-DOC-004', valid.replace(/<meta\b[^>]*\bcharset="utf-8"[^>]*>/iu, '')
      .replace('<head>', '<head><!-- <meta charset="utf-8"> -->')],
    ['SHP-DOC-007', valid.replace(/\sclass="[^"]*"/gu, '')
      .replace('<body>', '<body><!-- <section class="falsely-structural"> -->')],
    ['SHP-DOC-008', valid.replace(/\sdata-[a-z0-9][a-z0-9-]*="[^"]*"/gu, '')
      .replace('<body>', '<body><!-- <section data-source="falsely-carried"> -->')],
  ];
  for (const [code, html] of invalid)
    assert.ok(validateShpDocumentBytes(html).some(violation => violation.code === code),
      'comment cannot substitute for the required authored attribute: ' + code);
  assert.deepEqual(validateShpDocumentBytes(valid.replace('<head>',
    '<head><!-- <meta charset="utf-8"><section class="fake" data-source="fake"> -->')), [],
    'irrelevant comment tokens cannot alter a valid packet');
});

test('a receiving document renderer wraps the exact article and remains within inspection safety', () => {
  const packet = pack(form(), {
    source: 'source:1',
    renderDocument: article => '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>body{color:black}</style></head><body>' + article + '</body></html>',
  });
  assert.equal(verifyPacket(packet), true);
  assert.equal(packet.html.match(/<!DOCTYPE html>/g).length, 1);
  assert.deepEqual(markup(packet.html), form().cells);
  for (const fragment of ['<script>run()</script>', '<img onerror="run()">', '<a href="java&#x73;cript:run()">x</a>', '<iframe srcdoc="hello"></iframe>']) {
    assert.throws(() => pack(form(), { source: 's', renderDocument: () => project(form()).replace('</body>', fragment + '</body>') }), /inspection safety/);
  }
});

test('JavaScript syntax travels inside the packet and activates only at the deliberate render boundary', () => {
  const syntax = 'globalThis.__shpExecuted = "<safe & value>";';
  const packet = pack(form(), { source: 's', syntax });
  assert.match(packet.html, /<template data-shp-syntax="javascript">/);
  assert.doesNotMatch(packet.html, /<script/);
  assert.deepEqual(validateShpDocumentBytes(packet.html), []);
  assert.equal(renderPacket(packet), packet.html);
  assert.deepEqual(markup(packet.html), form().cells);
  assert.equal(globalThis.__shpExecuted, undefined);
  const activated = renderPacket(packet, { executeJavaScript: true });
  assert.ok(activated.includes('<script type="module">' + syntax + '</script>'));
  assert.ok(validateShpDocumentBytes(activated).some(({ code }) => code === 'SHP-DOC-005'));
  const hostile = pack(form(), { source: 's', syntax: '</script><script>alert(1)</script>' });
  assert.equal(verifyPacket(hostile), true);
  assert.throws(() => renderPacket(hostile, { executeJavaScript: true }), /inline module/);
  assert.throws(() => renderPacket({ ...packet, html: packet.html + 'tampered' }), /identity/);
});

test('markup ignores syntax, comments and scripts and refuses inconsistent typed coordinates', () => {
  const html = project(form());
  assert.deepEqual(markup('<script>' + html + '</script><!--' + html + '--><template>' + html + '</template>'), []);
  assert.throws(() => markup(html.replace('data-v="shp-ref:object:2"', 'data-v="shp-ref:object:3"')), /inconsistent v/);
  assert.throws(() => markup(html.replace('data-positive="true"', 'data-positive="invalid"')), /invalid evidence side/);
  assert.throws(() => markup(html.replace(/data-evidence="[^"]*"/, 'data-evidence="null"')), /evidence pair/);
});

test('interleaved subject order is preserved and every emitted packet verifies', () => {
  const cells = ['a', 'b', 'a'].map((subject, i) => ({ cell: { subject, predicate: 'p', object: i }, evidence: form().cells[0].evidence }));
  const packet = pack(fromCells('all', cells), { source: 'source' });
  assert.deepEqual(markup(packet.html), cells);
  assert.equal(verifyPacket(packet), true);
});

test('document renderer cannot change settled charge or witness evidence', () => {
  for (const transform of [
    html => html.replace('data-evidence="', 'data-evidence="[]'),
    html => html.replace('data-positive="true"', 'data-positive="false"').replace('data-value="potential"', 'data-value="absurd"'),
  ]) {
    assert.throws(() => pack(form(), { source: 's', renderDocument: () => transform(project(form())) }));
  }
});

test('HTML NUL display normalization retains original typed coordinates and evidence', () => {
  const cells = [{ cell: { subject: 's\0t', predicate: 'p', object: 'v\0x' }, evidence: evidence({ for: ['f\0a'], against: ['a\0g'] }) }];
  const data = fromCells('nul-display', cells);
  const packet = pack(data, { source: 'typed-source' });
  assert.equal(verifyPacket(packet), true);
  assert.deepEqual(markup(renderPacket(packet)), cells);
  assert.doesNotMatch(packet.html, /\u0000/u);
});

test('SHP inspection refuses authored network resources regardless of HTML attribute quoting', () => {
  const safe = project(form());
  assert.deepEqual(validateShpDocumentBytes(safe), []);
  const networkElements = [
    '<img src="https://external.example.invalid/image.png">',
    "<img src='https://external.example.invalid/image.png'>",
    '<img src=https://external.example.invalid/image.png>',
    '<img src="//external.example.invalid/image.png">',
    "<link rel=stylesheet href='http://external.example.invalid/theme.css'>",
    '<img src="https&#58;//external.example.invalid/image.png">',
    "<script src='https://external.example.invalid/run.js'></script>",
  ];
  for (const element of networkElements) {
    const document = safe.replace('<body>', '<body>' + element);
    assert.notEqual(document, safe, 'positive fixture must include a body insertion point');
    assert.ok(validateShpDocumentBytes(document).some(({ code }) => code === 'SHP-DOC-006'),
      'real source attributes must refuse external network dependency: ' + element);
  }
  const comment = safe.replace('<body>',
    '<body><!-- <img src="https://external.example.invalid/forged.png"><script src="https://external.example.invalid/forged.js"></script> -->');
  assert.deepEqual(validateShpDocumentBytes(comment), [],
    'literal text in an inert comment must not be treated as authored network or script elements');
  const activeScript = safe.replace('<body>', '<body><script>void 0</script>');
  assert.ok(validateShpDocumentBytes(activeScript).some(({ code }) => code === 'SHP-DOC-005'),
    'an authored script token must remain refused');
});


test('SHP inspection refuses alternate authority slashes recognized by URL parsing', () => {
  const safe = project(form());
  const base = 'https://local.example.invalid/';
  for (const prefix of ['//', '/\\', '\\/', '\\\\']) {
    const target = prefix + 'external.example.invalid/image.png';
    assert.equal(new URL(target, base).hostname, 'external.example.invalid');
    for (const element of [
      `<img src="${target}">`,
      `<video poster="${target}"></video>`,
      `<link rel="stylesheet" href="${target}">`,
    ]) {
      const html = safe.replace('<body>', '<body>' + element);
      assert.ok(validateShpDocumentBytes(html).some(v => v.code === 'SHP-DOC-006'),
        'URL parser authority must not bypass resource refusal: ' + element);
    }
  }
  for (const target of ['/local.png', 'relative.png']) {
    assert.equal(new URL(target, base).hostname, 'local.example.invalid');
    assert.deepEqual(validateShpDocumentBytes(safe.replace('<body>',
      `<body><img src="${target}">`)), [], 'existing local-resource policy remains unchanged');
  }
});

test('SHP inspection refuses authored responsive image-source candidates, including after a local fallback', () => {
  const safe = project(form());
  assert.deepEqual(validateShpDocumentBytes(safe), [], 'existing packet remains accepted');
  const responsiveResources = [
    '<img srcset="https://external.example.invalid/a.png 1x">',
    '<img src="/local.png" srcset="/local.png 1x, https://external.example.invalid/b.png 2x">',
    '<picture><source srcset="//external.example.invalid/c.webp 1x"><img src="/local.png"></picture>',
    '<img srcset="https&#58;//external.example.invalid/a.png 1x">',
    '<link rel="preload" as="image" imagesrcset="https://external.example.invalid/d.png 2x">',
    '<source src=https://external.example.invalid/f.png>',
    // Fail closed even for local-only responsive candidates until a browser-equivalent
    // candidate parser can distinguish and admit them.
    '<img srcset="/local.png 1x">',
  ];
  for (const element of responsiveResources) {
    const document = safe.replace('<body>', '<body>' + element);
    assert.ok(validateShpDocumentBytes(document).some(({ code }) => code === 'SHP-DOC-006'),
      'responsive network-source admission must refuse: ' + element);
  }
  const inert = safe.replace('<body>',
    '<body><!-- <img srcset="https://external.example.invalid/forged.png 1x"> -->');
  assert.deepEqual(validateShpDocumentBytes(inert), [],
    'a commented srcset is inert, not an authored resource candidate');
});

test('SHP inspection refuses external media and SVG resource attributes while retaining passive links', () => {
  const safe = project(form());
  assert.deepEqual(validateShpDocumentBytes(safe), []);
  // All of these authored URL attributes may cause a browser to fetch a
  // remote resource, independently of img/srcset and link/stylesheet rules.
  const remote = [
    '<video controls poster="https://external.example.invalid/poster.png"></video>',
    '<video autoplay muted src="https://external.example.invalid/video.mp4"></video>',
    '<audio preload="auto" src="https://external.example.invalid/clip.mp3"></audio>',
    '<track src="https://external.example.invalid/subtitles.vtt">',
    '<input type="image" src="https://external.example.invalid/button.png">',
    '<svg><image href="https://external.example.invalid/shape.svg"/></svg>',
    '<svg><use xlink:href="https://external.example.invalid/icon.svg#shape"/></svg>',
    '<table background="https://external.example.invalid/background.png"><tr><td>body</td></tr></table>',
    '<video poster="https&#58;//external.example.invalid/encoded.png"></video>',
  ];
  for (const element of remote) {
    const document = safe.replace('<body>', '<body>' + element);
    assert.ok(validateShpDocumentBytes(document).some(({ code }) => code === 'SHP-DOC-006'),
      'an authored external media or SVG resource must be refused: ' + element);
  }
  // A clickable external link does not require a network fetch for inspection.
  // This repair must not turn the packet into a no-links document.
  const passive = safe.replace('<body>',
    '<body><a href="https://external.example.invalid/ordinary-reference">external citation</a>');
  assert.deepEqual(validateShpDocumentBytes(passive), [],
    'a passive authored navigation link remains readable');
  const inert = safe.replace('<body>',
    '<body><!-- <video poster="https://external.example.invalid/inert.png"></video> -->');
  assert.deepEqual(validateShpDocumentBytes(inert), [],
    'an HTML comment is not an authored resource element');
});

test('SHP inspection refuses CSS resource loaders without treating comments as active style', () => {
  const safe = project(form());
  assert.deepEqual(validateShpDocumentBytes(safe), []);
  const hosted = [
    '<style>@import "https://external.example.invalid/theme.css";</style>',
    '<style>@im\\70ort "https://external.example.invalid/theme.css";</style>',
    '<style>div{background:url(https://external.example.invalid/a.png)}</style>',
    '<style>div{background:u\\72l(https://external.example.invalid/a.png)}</style>',
    '<style>div{background:image-set("https://external.example.invalid/a.png" 1x)}</style>',
    '<div style="background-image:url(https://external.example.invalid/a.png)">remote</div>',
    '<div style="background-image:u\\72l(https://external.example.invalid/a.png)">escaped</div>',
    '<style>div{background:url(/local-only.png)}</style>',
    // CSS quoted comment delimiters are strings, not CSS comments;
    // a naive comment-stripping regex must not erase a real loader between them.
    '<style>p::before{content:"/*"} p{background:url(https://external.example.invalid/quoted-comment.png)} p::after{content:"*/"}</style>',
    '<div style="--front:&quot;/*&quot;;background:url(https://external.example.invalid/inline-quoted-comment.png);--tail:&quot;*/&quot;">test</div>',
  ];
  for (const fragment of hosted) {
    const document = safe.replace('<body>', '<body>' + fragment);
    assert.ok(validateShpDocumentBytes(document).some(({ code }) => code === 'SHP-DOC-006'),
      'authored CSS resource loader must be refused: ' + fragment);
  }
  const ordinary = safe.replace('<body>',
    '<body><style>body{color:black} .quiet{opacity:.8}</style><div style="color:blue">safe</div>');
  assert.deepEqual(validateShpDocumentBytes(ordinary), [],
    'ordinary non-fetching CSS remains allowed');
  const quotedCommentText = safe.replace('<body>',
    '<body><style>p::before{content:"/*"} p{color:blue} p::after{content:"*/"}</style>');
  assert.deepEqual(validateShpDocumentBytes(quotedCommentText), [],
    'CSS strings containing comment-like delimiters without loaders are allowed');
  const inert = safe.replace('<body>',
    '<body><!-- <style>@import "https://external.example.invalid/css"</style> -->');
  assert.deepEqual(validateShpDocumentBytes(inert), [],
    'HTML comments containing fake style must not trigger a resource refusal');
});


test('SHP inspection checks authored template content for unsafe attributes', () => {
  const safe = project(form());
  assert.deepEqual(validateShpDocumentBytes(safe), []);
  const refused = [
    ['SHP-DOC-010', '<template><span onfocus="noop()">focus</span></template>'],
    ['SHP-DOC-011', '<template><iframe src="/local"></iframe></template>'],
    ['SHP-DOC-012', '<template><a href="java&#x73;cript:noop()">text</a></template>'],
    ['SHP-DOC-011', '<template><meta http-equiv=" Refresh " content="0;url=/local"></template>'],
  ];
  for (const [code, fragment] of refused) {
    const html = safe.replace('<body>', '<body>' + fragment);
    assert.ok(validateShpDocumentBytes(html).some(v => v.code === code),
      'source-authored template content must not bypass document safety: ' + code);
  }
  assert.deepEqual(validateShpDocumentBytes(safe.replace('<body>',
    '<body><!-- <template><iframe src="/local"></iframe></template> -->')), [],
    'HTML comments are inert, not start tags');
  assert.deepEqual(validateShpDocumentBytes(pack(form(), { source: 's', syntax: 'void 0;' }).html), [],
    'the data-bearing syntax template remains accepted');
});
