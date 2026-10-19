import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnrichmentUrl } from './enrichment-url';

test('accepts newly discovered public HTTPS domains regardless of the old allowlist', () => {
  const previous = process.env.APPROVED_ENRICHMENT_DOMAINS;
  process.env.APPROVED_ENRICHMENT_DOMAINS = 'already-approved.example';

  try {
    const result = validateEnrichmentUrl('https://www.new-manufacturer.example/capabilities');
    assert.equal(result?.sourceHost, 'www.new-manufacturer.example');
  } finally {
    if (previous === undefined) delete process.env.APPROVED_ENRICHMENT_DOMAINS;
    else process.env.APPROVED_ENRICHMENT_DOMAINS = previous;
  }
});

test('still rejects non-HTTPS and local enrichment targets', () => {
  assert.equal(validateEnrichmentUrl('http://manufacturer.example'), null);
  assert.equal(validateEnrichmentUrl('https://localhost'), null);
  assert.equal(validateEnrichmentUrl('https://127.0.0.1'), null);
});
