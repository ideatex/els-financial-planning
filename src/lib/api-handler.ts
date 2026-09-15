import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { formatErrorResponse } from '@/core/errors/AppError';
import { logger } from '@/lib/logger';

export type ApiRouteHandler = (
  req: NextRequest,
  context: { params: Record<string, string | string[]> }
) => Promise<NextResponse | Response>;

export function createApiHandler(handler: ApiRouteHandler) {
  return async (req: NextRequest, context: { params: Record<string, string | string[]> }) => {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    const method = req.method;
    const url = req.nextUrl.pathname;

    logger.debug(`Incoming API Request: ${method} ${url}`, { requestId });

    try {
      const response = await handler(req, context);
      const durationMs = Date.now() - startTime;
      logger.info(`Completed API Request: ${method} ${url} [${response.status}] ${durationMs}ms`, {
        requestId,
      });
      return response;
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const { statusCode, body } = formatErrorResponse(err);

      logger.error(`API Error: ${method} ${url} [${statusCode}] ${durationMs}ms`, {
        requestId,
        error: body.error,
      });

      return NextResponse.json(body, {
        status: statusCode,
        headers: {
          'x-request-id': requestId,
          'Content-Type': 'application/json',
        },
      });
    }
  };
}

export function extractBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}
