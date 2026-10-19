import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAmazonSearchUrl } from './amazon-search-url';

test('new research requests Amazon Best Sellers order', () => {
  const url = buildAmazonSearchUrl({ keyword: 'protein bar', marketplace: 'amazon.com', page: 1, ranking: 'best_sellers' }, 'test-key');
  assert.equal(url.searchParams.get('engine'), 'amazon');
  assert.equal(url.searchParams.get('k'), 'protein bar');
  assert.equal(url.searchParams.get('s'), 'exact-aware-popularity-rank');
});

test('historical featured jobs keep their original search order', () => {
  const url = buildAmazonSearchUrl({ keyword: 'protein bar', marketplace: 'amazon.com', page: 1, ranking: 'featured' }, 'test-key');
  assert.equal(url.searchParams.has('s'), false);
});
