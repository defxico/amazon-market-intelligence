import { z } from 'zod';

export const researchInput = z.object({
  keyword: z.string().trim().min(2).max(120)
    .transform((value) => value.replace(/\s+/g, ' ').toLowerCase()),
  marketplace: z.literal('amazon.com').default('amazon.com'),
  page: z.number().int().min(1).max(3).default(1),
  limit: z.number().int().min(1).max(20).default(10),
}).strict();

export type ResearchInput = z.infer<typeof researchInput>;

export const jobIdInput = z.string().min(8).max(64).regex(/^[a-zA-Z0-9_-]+$/);

export const enrichmentInput = z.object({
  url: z.string().min(1).max(2048),
}).strict();

export const trendKeywordInput = z.string().trim().min(2).max(120)
  .transform((value) => value.replace(/\s+/g, ' ').toLowerCase());
