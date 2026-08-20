import { setImmediate } from 'node:timers/promises';

import { requestContext } from '../context/request-context.js';
import { Injectable } from '../decorators/injectable.js';
import { NotFoundError } from '../errors/http-errors.js';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  requestId: string;
}

@Injectable()
export class UserRepository {
  async findOne(id: string): Promise<UserRecord> {
    await setImmediate();

    if (id === 'missing') {
      throw new NotFoundError(`User ${id} was not found`);
    }

    const requestId = requestContext.getRequestId();
    console.log(`[${requestId}] UserRepository.findOne(${id})`);

    return {
      id,
      name: 'Ada',
      email: 'ada@example.com',
      requestId,
    };
  }
}
