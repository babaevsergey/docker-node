import { performance } from 'node:perf_hooks';

import type { ExecutionContext, Interceptor, Next } from '../lifecycle.js';

export type LogWriter = (message: string) => void;

export class LoggingInterceptor implements Interceptor {
  constructor(private readonly write: LogWriter = console.log) {}

  async intercept(context: ExecutionContext, next: Next): Promise<unknown> {
    const startedAt = performance.now();

    try {
      return await next();
    } finally {
      const duration = performance.now() - startedAt;
      this.write(
        `${context.request.method ?? 'UNKNOWN'} ${context.url.pathname} — ${duration.toFixed(1)} ms`,
      );
    }
  }
}
