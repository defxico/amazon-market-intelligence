export type SearchRanking = 'featured' | 'best_sellers';

type SearchInput = {
  keyword: string;
  marketplace: 'amazon.com';
  page: number;
  ranking: SearchRanking;
};

export function buildAmazonSearchUrl(input: SearchInput, apiKey: string): URL {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'amazon');
  url.searchParams.set('amazon_domain', input.marketplace);
  url.searchParams.set('k', input.keyword);
  url.searchParams.set('page', String(input.page));
  if (input.ranking === 'best_sellers') {
    url.searchParams.set('s', 'exact-aware-popularity-rank');
  }
  url.searchParams.set('api_key', apiKey);
  return url;
}
