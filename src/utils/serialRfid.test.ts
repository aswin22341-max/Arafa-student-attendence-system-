import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSharedAppOrigin,
  parseRfidUidFromSerialLine,
} from './serialRfid.ts';

test('parseRfidUidFromSerialLine parses labeled and bare RFID UID lines', () => {
  assert.equal(parseRfidUidFromSerialLine('UID:9C770007'), '9C770007');
  assert.equal(
    parseRfidUidFromSerialLine('Scanned RFID UID: 9c:77:00:07'),
    '9C770007'
  );
  assert.equal(
    parseRfidUidFromSerialLine('Card UID: A1 B2 C3 D4'),
    'A1B2C3D4'
  );
  assert.equal(parseRfidUidFromSerialLine('9c 77 00 07'), '9C770007');
  assert.equal(parseRfidUidFromSerialLine('HTTP 200: {"status":"logged"}'), null);
  assert.equal(parseRfidUidFromSerialLine('Connecting to WiFi...'), null);
  assert.equal(parseRfidUidFromSerialLine('Firmware Version: 0x92'), null);
});

test('buildSharedAppOrigin converts ais-dev preview URLs to ais-pre public URLs', () => {
  const devResult = buildSharedAppOrigin(
    'https://ais-dev-abc123.asia-southeast1.run.app'
  );
  assert.equal(devResult.isDevPreview, true);
  assert.equal(
    devResult.suggestedPublicOrigin,
    'https://ais-pre-abc123.asia-southeast1.run.app'
  );

  const prodResult = buildSharedAppOrigin(
    'https://ais-pre-abc123.asia-southeast1.run.app'
  );
  assert.equal(prodResult.isDevPreview, false);
  assert.equal(
    prodResult.suggestedPublicOrigin,
    'https://ais-pre-abc123.asia-southeast1.run.app'
  );
});
