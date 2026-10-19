import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverManufacturerCandidates, manufacturerSearchIsEnabled } from './manufacturer-discovery';

const realProduct = {
  id: 'product-1',
  asin: 'B000000001',
  marketplace: 'amazon.com',
  title: 'Protein Bar Variety Pack',
  brand: 'Example Nutrition',
  observations: [{ synthetic: false, status: 'SUCCEEDED' }],
};

test('keeps manufacturer search disabled without an explicit true flag', () => {
  assert.equal(manufacturerSearchIsEnabled(undefined), false);
  assert.equal(manufacturerSearchIsEnabled('false'), false);
  assert.equal(manufacturerSearchIsEnabled('True'), false);
  assert.equal(manufacturerSearchIsEnabled('true'), true);
});

test('returns no candidates when Firecrawl search has no web results', async () => {
  const candidates = await discoverManufacturerCandidates(realProduct, async () => ({ web: [] }));
  assert.deepEqual(candidates, []);
});

test('filters invalid and non-public result URLs', async () => {
  const candidates = await discoverManufacturerCandidates(realProduct, async () => ({
    web: [
      { title: 'HTTP result', url: 'http://maker.example/item', description: 'Snippet' },
      { title: 'Private result', url: 'https://localhost/item', description: 'Snippet' },
      { title: 'Credential result', url: 'https://user:pass@maker.example/item', description: 'Snippet' },
      { title: 'Valid result', url: 'https://maker.example/item', description: 'Snippet' },
    ],
  }));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].url, 'https://maker.example/item');
});

test('deduplicates URLs and omits scrape options from the search call', async () => {
  let receivedOptions: unknown;
  const candidates = await discoverManufacturerCandidates(realProduct, async (query, options) => {
    assert.match(query, /B000000001/);
    assert.match(query, /manufacturer/i);
    receivedOptions = options;
    return {
      web: [
        { title: 'Maker', url: 'https://maker.example/item#details', description: 'Found snippet' },
        { title: 'Maker duplicate', url: 'https://maker.example/item', description: 'Duplicate snippet' },
      ],
    };
  });
  assert.deepEqual(receivedOptions, { limit: 5, sources: ['web'] });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].url, 'https://maker.example/item');
  assert.equal(candidates[0].relationshipVerified, false);
});

test('propagates a provider failure', async () => {
  const failure = new Error('simulated Firecrawl failure');
  await assert.rejects(
    discoverManufacturerCandidates(realProduct, async () => { throw failure; }),
    (error) => error === failure,
  );
});

test('does not call provider for a synthetic-only product', async () => {
  let called = false;
  await assert.rejects(
    discoverManufacturerCandidates({
      ...realProduct,
      observations: [{ synthetic: true, status: 'SUCCEEDED' }],
    }, async () => { called = true; return { web: [] }; }),
    (error) => error instanceof Error && 'code' in error && error.code === 'VALIDATION_ERROR',
  );
  assert.equal(called, false);
});
