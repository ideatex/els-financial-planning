/**
 * Structured JSON Logger
 * Formats log messages with timestamp, log level, optional context (orgId, userId, requestId),
 * and structured metadata for high-observability micro-services and serverless environments.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogPayload {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: {
    requestId?: string;
    organizationId?: string;
    userId?: string;
    action?: string;
    [key: string]: unknown;
  };
  details?: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const currentMinLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return (LOG_LEVELS[level] ?? 20) >= (LOG_LEVELS[currentMinLevel] ?? 20);
}

function writeLog(level: LogLevel, message: string, context?: LogPayload['context'], details?: unknown) {
  if (!shouldLog(level)) return;

  const payload: LogPayload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ? { context } : {}),
    ...(details !== undefined ? { details } : {}),
  };

  const json = JSON.stringify(payload);
  if (level === 'error') {
    console.error(json);
  } else if (level === 'warn') {
    console.warn(json);
  } else {
    console.log(json);
  }
}

export const logger = {
  debug: (message: string, context?: LogPayload['context'], details?: unknown) =>
    writeLog('debug', message, context, details),
  info: (message: string, context?: LogPayload['context'], details?: unknown) =>
    writeLog('info', message, context, details),
  warn: (message: string, context?: LogPayload['context'], details?: unknown) =>
    writeLog('warn', message, context, details),
  error: (message: string, context?: LogPayload['context'], details?: unknown) =>
    writeLog('error', message, context, details),
};
