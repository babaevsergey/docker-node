import { z } from 'zod';

import { ValidationError } from '../errors/http-errors.js';
import type { ArgumentMetadata, ExecutionContext, PipeTransform } from '../lifecycle.js';
import type { Constructor } from '../tokens.js';

export interface ZodDtoConstructor<T = object> extends Constructor<T> {
  schema: z.ZodType<T>;
}

export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata, _context: ExecutionContext): unknown {
    if (metadata.source !== 'body' || !isZodDto(metadata.metatype)) {
      return value;
    }

    const result = metadata.metatype.schema.safeParse(value);

    if (!result.success) {
      throw new ValidationError(
        result.error.issues.map((issue) => ({
          field: issue.path.map(String).join('.') || 'body',
          constraints: [issue.message],
        })),
      );
    }

    return Object.assign(new metadata.metatype(), result.data);
  }
}

function isZodDto(value: unknown): value is ZodDtoConstructor {
  if (typeof value !== 'function') return false;

  const candidate = value as unknown as { schema?: { safeParse?: unknown } };
  return typeof candidate.schema?.safeParse === 'function';
}
