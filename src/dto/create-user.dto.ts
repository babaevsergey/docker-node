import { z } from 'zod';

export class CreateUserDto {
  static readonly schema = z.object({
    name: z.string().min(2),
    email: z.email(),
  });

  name!: string;
  email!: string;
}
