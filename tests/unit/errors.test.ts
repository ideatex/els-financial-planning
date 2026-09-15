import { describe, it, expect } from 'vitest';
import {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  formatErrorResponse,
} from '@/core/errors/AppError';

describe('Application Error Hierarchy', () => {
  it('correctly maps status codes and codes for typed domain errors', () => {
    const unauth = new UnauthorizedError('Please log in');
    expect(unauth.statusCode).toBe(401);
    expect(unauth.code).toBe('UNAUTHORIZED');

    const forbidden = new ForbiddenError('No admin access');
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.code).toBe('FORBIDDEN');

    const notFound = new NotFoundError('Plan scenario missing');
    expect(notFound.statusCode).toBe(404);
    expect(notFound.code).toBe('NOT_FOUND');

    const validation = new ValidationError('Invalid budget inputs', { field: 'price' });
    expect(validation.statusCode).toBe(400);
    expect(validation.code).toBe('VALIDATION_ERROR');
    expect(validation.details).toEqual({ field: 'price' });

    const conflict = new ConflictError('Slug already exists');
    expect(conflict.statusCode).toBe(409);
    expect(conflict.code).toBe('CONFLICT');
  });

  it('formats RFC 7807 compliant error responses for AppError', () => {
    const err = new ValidationError('Field required', { field: 'email' });
    const formatted = formatErrorResponse(err);

    expect(formatted.statusCode).toBe(400);
    expect(formatted.body.error.code).toBe('VALIDATION_ERROR');
    expect(formatted.body.error.message).toBe('Field required');
    expect(formatted.body.error.details).toEqual({ field: 'email' });
    expect(formatted.body.error.timestamp).toBeDefined();
  });

  it('gracefully formats unhandled generic Errors as 500', () => {
    const generic = new Error('Database connection timeout');
    const formatted = formatErrorResponse(generic);

    expect(formatted.statusCode).toBe(500);
    expect(formatted.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(formatted.body.error.message).toBe('Database connection timeout');
  });
});
