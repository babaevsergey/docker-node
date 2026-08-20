import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

import type { Constructor } from '../tokens.js';

export interface ValidationDetail {
  field: string;
  constraints: string[];
}

export class ValidationException extends Error {
  readonly statusCode = 400;

  constructor(readonly details: ValidationDetail[]) {
    super('Validation failed');
    this.name = 'ValidationException';
  }
}

export class ValidationPipe {
  async transform<T>(value: unknown, metatype: Constructor<T>): Promise<T> {
    if (!isObject(value)) {
      throw new ValidationException([
        { field: 'body', constraints: ['body must be a JSON object'] },
      ]);
    }

    const instance = plainToInstance(metatype as ClassConstructor<T>, value);
    const errors = await validate(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      throw new ValidationException(flattenErrors(errors));
    }

    return instance;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flattenErrors(errors: ValidationError[], parentPath = ''): ValidationDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const ownConstraints = Object.values(error.constraints ?? {});
    const ownDetails = ownConstraints.length > 0 ? [{ field, constraints: ownConstraints }] : [];

    return [...ownDetails, ...flattenErrors(error.children ?? [], field)];
  });
}
