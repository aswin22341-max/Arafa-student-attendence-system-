import test from 'node:test';
import assert from 'node:assert/strict';
import { parseApiResponse } from './api.ts';

test('parseApiResponse parses valid JSON payloads', async () => {
  const res = new Response(JSON.stringify({ status: 'ok', count: 2 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await parseApiResponse<{ status: string; count: number }>(
    res,
    'Fallback'
  );
  assert.equal(data.status, 'ok');
  assert.equal(data.count, 2);
});

test('parseApiResponse surfaces backend JSON error and fieldErrors cleanly', async () => {
  const res = new Response(
    JSON.stringify({
      error: 'Invalid username or password.',
      fieldErrors: { rfidUid: 'Duplicate UID' },
    }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }
  );
  await assert.rejects(
    () => parseApiResponse(res, 'Sign-in failed.'),
    (err: any) =>
      err.message === 'Invalid username or password.' &&
      err.fieldErrors?.rfidUid === 'Duplicate UID'
  );
});

test('parseApiResponse turns plain-text proxy errors into a clear message instead of JSON SyntaxError', async () => {
  const res = new Response('The page could not be found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain' },
  });
  await assert.rejects(
    () => parseApiResponse(res, 'Sign-in failed.'),
    (err: any) =>
      err.isNonJsonGatewayError === true &&
      err.status === 404 &&
      /waking up or unavailable/i.test(err.message)
  );
});
