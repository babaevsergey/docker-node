import { Injectable } from '../decorators/injectable.js';
import type { CreateUserDto } from '../dto/create-user.dto.js';
import { UserRepository, type UserRecord } from './user.repository.js';

@Injectable()
export class UsersService {
  constructor(private readonly users: UserRepository) {}

  findOne(id: string): Promise<UserRecord> {
    return this.users.findOne(id);
  }

  create(body: CreateUserDto): CreateUserDto {
    return body;
  }
}
