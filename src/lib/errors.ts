export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'BUDGET_EXHAUSTED'
  | 'NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'WORKFLOW_DISPATCH_FAILED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class DispatchError extends Error {
  constructor(readonly jobId: string) {
    super('Research dispatch is pending or failed.');
    this.name = 'DispatchError';
  }
}

export const errors = {
  unauthorized: () => new AppError('UNAUTHORIZED', 'Authentication is required.', 401),
  validation: (message = 'The request is invalid.') => new AppError('VALIDATION_ERROR', message, 422),
  rateLimited: () => new AppError('RATE_LIMITED', 'The request limit has been reached.', 429),
  budgetExhausted: (provider: string) => new AppError('BUDGET_EXHAUSTED', `${provider} daily budget has been reached.`, 429),
  notFound: () => new AppError('NOT_FOUND', 'The requested resource was not found.', 404),
  providerUnavailable: () => new AppError('PROVIDER_UNAVAILABLE', 'The data provider could not complete the request.', 502),
  dependencyUnavailable: () => new AppError('DEPENDENCY_UNAVAILABLE', 'A required service is temporarily unavailable.', 503),
};
