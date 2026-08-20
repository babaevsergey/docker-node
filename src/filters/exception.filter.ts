import type { ServerResponse } from 'node:http';

import { ForbiddenError, NotFoundError, ValidationError } from '../errors/http-errors.js';

export class ExceptionFilter {
  constructor(private readonly report: (error: unknown) => void = console.error) {}

  catch(error: unknown, response: ServerResponse): void {
    if (error instanceof ForbiddenError) {
      this.sendJson(response, 403, { message: error.message });
      return;
    }

    if (error instanceof NotFoundError) {
      this.sendJson(response, 404, { message: error.message });
      return;
    }

    if (error instanceof ValidationError) {
      this.sendJson(response, 400, {
        message: error.message,
        errors: error.details,
      });
      return;
    }

    this.report(error);
    this.sendJson(response, 500, { message: 'Internal server error' });
  }

  private sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
    response.statusCode = statusCode;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(value));
  }
}
