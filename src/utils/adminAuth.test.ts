import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
} from './adminAuth.ts';

test('hashPassword and verifyPassword validate matching passwords and reject wrong ones', () => {
  const hash = hashPassword('Arafa@2026');
  assert.equal(verifyPassword('Arafa@2026', hash), true);
  assert.equal(verifyPassword('wrongpass', hash), false);
  assert.equal(verifyPassword('Arafa@2026', 'malformed'), false);
});

test('signSessionToken and verifySessionToken enforce signature and expiry', () => {
  const secret = 'test-secret-key';
  const token = signSessionToken(
    { adminId: 1, username: 'admin', fullName: 'School Administrator' },
    secret,
    3600
  );

  const verified = verifySessionToken(token, secret);
  assert.ok(verified);
  assert.equal(verified.adminId, 1);
  assert.equal(verified.username, 'admin');

  // Wrong secret fails
  assert.equal(verifySessionToken(token, 'other-secret'), null);

  // Tampered payload fails
  const [payload, sig] = token.split('.');
  const tampered = `${payload.slice(0, -1)}X.${sig}`;
  assert.equal(verifySessionToken(tampered, secret), null);

  // Expired token fails
  const expired = signSessionToken(
    { adminId: 1, username: 'admin', fullName: 'School Administrator' },
    secret,
    -10
  );
  assert.equal(verifySessionToken(expired, secret), null);
});
