// Error handling utilities

import { APIError, APIResponse } from '../types';

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorResponse(
  error: AppError | Error,
  status: number = 500
): Response {
  const apiError: APIError = {
    code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
    message: error.message,
    details: error instanceof AppError ? error.details : undefined,
  };

  const response: APIResponse<never> = {
    success: false,
    error: apiError,
  };

  return new Response(JSON.stringify(response), {
    status: error instanceof AppError ? error.status : status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function successResponse<T>(
  data: T,
  status: number = 200
): Response {
  const response: APIResponse<T> = {
    success: true,
    data,
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
