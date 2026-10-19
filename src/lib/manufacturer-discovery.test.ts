import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFirecrawlCreditsUsed, discoverManufacturerCandidates, manufacturerSearchIsEnabled, serializeSavedProductCandidates } from './manufacturer-discovery';

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
  const result = await discoverManufacturerCandidates(realProduct, 'protein bar for private label', async () => ({ web: [] }));
  assert.deepEqual(result.leads, []);
  assert.equal(result.diagnostics.returned, 0);
});

test('filters invalid and non-public result URLs', async () => {
  const result = await discoverManufacturerCandidates(realProduct, 'protein bar for private label', async () => ({
    web: [
      { title: 'HTTP result', url: 'http://maker.example/item', description: 'Snippet' },
      { title: 'Private result', url: 'https://localhost/item', description: 'Snippet' },
      { title: 'Credential result', url: 'https://user:pass@maker.example/item', description: 'Snippet' },
      { title: 'Protein Bar Manufacturer', url: 'https://maker.example/item', description: 'Contract manufacturing for similar nutrition bars.' },
    ],
  }));
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].url, 'https://maker.example/item');
});

test('searches for similar-product manufacturing capacity without the competing brand or ASIN', async () => {
  let receivedOptions: unknown;
  const result = await discoverManufacturerCandidates(realProduct, 'protein bar for private label', async (query, options) => {
    assert.match(query, /private label/i);
    assert.match(query, /OEM/i);
    assert.match(query, /contract manufacturer/i);
    assert.match(query, /protein bar for private label/i);
    assert.doesNotMatch(query, /Example Nutrition|B000000001/i);
    receivedOptions = options;
    return {
      web: [
        { title: 'Private Label Protein Bar Manufacturer', url: 'https://maker.example/capabilities#details', description: 'Contract manufacturing for protein bars.' },
        { title: 'Duplicate contract manufacturing', url: 'https://maker.example/capabilities', description: 'Duplicate private label capability.' },
      ],
    };
  });
  assert.equal((receivedOptions as { limit: number }).limit, 10);
  assert.deepEqual((receivedOptions as { sources: string[] }).sources, ['web']);
  assert.ok((receivedOptions as { excludeDomains: string[] }).excludeDomains.includes('walmart.com'));
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].url, 'https://maker.example/capabilities');
  assert.equal(result.leads[0].source, 'firecrawl.search.manufacturer-v2');
  assert.equal(result.leads[0].relationshipVerified, false);
});

test('keeps manufacturing-capability pages and drops stores and product listings', async () => {
  const result = await discoverManufacturerCandidates(realProduct, 'protein bar for private label', async () => ({
    web: [
      { title: 'Protein bars on Amazon', url: 'https://www.amazon.com/dp/B000000001', description: 'Buy protein bars with fast shipping.' },
      { title: 'Protein Bar Store', url: 'https://shop.example/protein-bar', description: 'Shop protein bars and compare flavors.' },
      { title: 'Protein Bar Product Details', url: 'https://food.example/products/protein-bar', description: 'Manufacturer: Acme Foods. Buy protein bars online.' },
      { title: 'Protein Bar Manufacturer', url: 'https://maker.example/private-label-bars', description: 'Private label and contract manufacturing for protein bars.' },
      { title: 'Protein Bar Guide', url: 'https://guide.example/protein-bars', description: 'A list of popular protein bars and their reviews.' },
    ],
  }));

  assert.deepEqual(result.leads.map(({ url }) => url), ['https://maker.example/private-label-bars']);
});

test('propagates a provider failure', async () => {
  const failure = new Error('simulated Firecrawl failure');
  await assert.rejects(
    discoverManufacturerCandidates(realProduct, 'protein bar for private label', async () => { throw failure; }),
    (error) => error === failure,
  );
});

test('does not call provider for a synthetic-only product', async () => {
  let called = false;
  await assert.rejects(
    discoverManufacturerCandidates({
      ...realProduct,
      observations: [{ synthetic: true, status: 'SUCCEEDED' }],
    }, 'protein bar for private label', async () => { called = true; return { web: [] }; }),
    (error) => error instanceof Error && 'code' in error && error.code === 'VALIDATION_ERROR',
  );
  assert.equal(called, false);
});

test('serializes saved candidates with source and an unverified relationship', () => {
  const result = serializeSavedProductCandidates({
    asin: 'B00MNXGSAI',
    title: 'Protein Bar Variety Pack',
    latestSearch: {
      productBrief: 'protein bar for private label',
      requestId: 'provider-request-1',
      diagnostics: { returned: 1, saved: 1 },
      status: 'SUCCEEDED',
      searchedAt: new Date('2026-10-19T10:05:00.000Z'),
    },
    candidates: [{
      id: 'candidate-1',
      name: 'Example Nutrition product page',
      url: 'https://example.com/product',
      snippet: 'Protein bar product information.',
      productBrief: 'protein bar for private label',
      contactUrl: null,
      capabilityStatus: 'SEARCH_EVIDENCE',
      source: 'firecrawl.search',
      relationshipVerified: false,
      firstSeenAt: new Date('2026-10-19T10:00:00.000Z'),
      lastSeenAt: new Date('2026-10-19T10:05:00.000Z'),
    }],
    previousCandidates: [],
    legacyCandidates: [],
  });

  assert.equal(result.asin, 'B00MNXGSAI');
  assert.equal(result.candidates[0].url, 'https://example.com/product');
  assert.equal(result.candidates[0].snippet, 'Protein bar product information.');
  assert.equal(result.candidates[0].source, 'firecrawl.search');
  assert.equal(result.candidates[0].relationshipVerified, false);
  assert.equal(result.candidates[0].lastSeenAt, '2026-10-19T10:05:00.000Z');
});

test('limits saved candidates to five', () => {
  const candidates = Array.from({ length: 6 }, (_, index) => ({
    id: `candidate-${index}`,
    name: `Candidate ${index}`,
    url: `https://example.com/${index}`,
    snippet: `Snippet ${index}`,
    productBrief: 'protein bar for private label',
    contactUrl: null,
    capabilityStatus: 'SEARCH_EVIDENCE',
    source: 'firecrawl.search',
    relationshipVerified: false,
    firstSeenAt: new Date('2026-10-19T10:00:00.000Z'),
    lastSeenAt: new Date('2026-10-19T10:05:00.000Z'),
  }));

  assert.equal(serializeSavedProductCandidates({ asin: 'B00MNXGSAI', title: 'Protein bar', latestSearch: null, candidates, previousCandidates: [], legacyCandidates: [] }).candidates.length, 5);
});

test('reports credit usage only when both account snapshots support a nonnegative delta', () => {
  assert.equal(calculateFirecrawlCreditsUsed(20, 19), 1);
  assert.equal(calculateFirecrawlCreditsUsed(20, 20), 0);
  assert.equal(calculateFirecrawlCreditsUsed(20, 21), null);
  assert.equal(calculateFirecrawlCreditsUsed(null, 19), null);
});
