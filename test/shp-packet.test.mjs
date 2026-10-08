import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { sidesOfReading } from "@red-cup-engineering/computer-data-services-section/four";
import { evidence } from "@red-cup-engineering/signcell/cell";
import { canonical } from '../../../../json-services-section/src/index.mjs';
import { address, cellKey, fromCells, fromSection, markup, pack, project, ref, renderPacket, verifyPacket } from '../src/html/index.mjs';
import { validateShpDocumentBytes } from '../src/html/shp-profile.mjs';

const form = () => fromSection({ affirmed: [{ predicate: 'depends-on', object: ref('object:2'), citation: { feed: 'source:1', row: 8 } }] }, { subject: 'object:1' });

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
