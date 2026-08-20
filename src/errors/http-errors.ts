export interface ValidationDetail {
  field: string;
  constraints: string[];
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends Error {
  constructor(readonly details: ValidationDetail[]) {
    super('Validation failed');
    this.name = 'ValidationError';
  }
}
