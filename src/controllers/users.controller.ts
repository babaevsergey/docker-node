import { Controller } from '../decorators/controller.js';
import { Get, Post } from '../decorators/methods.js';
import { Body, Param } from '../decorators/params.js';
import { CreateUserDto } from '../dto/create-user.dto.js';
import { UsersService } from '../services/users.service.js';
import type { UserRecord } from '../services/user.repository.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id')
  findOne(@Param('id') id: string): Promise<UserRecord> {
    return this.users.findOne(id);
  }

  @Post()
  create(@Body() body: CreateUserDto): CreateUserDto {
    return this.users.create(body);
  }
}
