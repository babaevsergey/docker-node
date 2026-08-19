# mini-nest

Навчальна реалізація IoC-контейнера та HTTP-шару на TypeScript. Проєкт будує
граф залежностей, читає маршрути з декораторів, обробляє запити через
`node:http`, підставляє аргументи методів і валідує DTO. Готові DI- та
HTTP-фреймворки не використовуються.

## Запуск

Локально потрібен Node.js 22+:

```bash
npm ci
npm test
```

У Docker:

```bash
docker compose build api
docker compose run --rm api npm test
```

Запуск HTTP-сервера:

```bash
docker compose up --build
curl http://localhost:3000/health
```

## Частина 1: як працює IoC

Коли ввімкнені `experimentalDecorators` та `emitDecoratorMetadata`, TypeScript
додає до декорованого класу runtime-метадані `design:paramtypes`: масив
конструкторів, що відповідають типам параметрів конструктора. `@Injectable()`
позначає клас власними метаданими, а `Container` читає
`Reflect.getMetadata('design:paramtypes', Target)` і рекурсивно резолвить кожен
тип. Без `emitDecoratorMetadata` компілятор не генерує цей масив, тому типи
залежностей у JavaScript відсутні й автоматичний резолв неможливий. Метадані
також не з'являються на класі без жодного декоратора.

TypeScript-інтерфейси стираються під час компіляції та в `design:paramtypes`
стають `Object`. Для них використовується `@Inject(token)`, а значення або клас
реєструється під рядковим чи `Symbol`-токеном.

Singleton є стандартним scope. `@Injectable({ scope: 'transient' })` створює
новий екземпляр при кожному резолві. Під час рекурсії контейнер зберігає поточний
шлях, тому цикл завершується помилкою на кшталт
`Circular dependency detected: A -> B -> A`.

## Частина 2: маршрути та HTTP

`@Controller(prefix)` записує префікс у метадані класу. `@Get(path)` і
`@Post(path)` записують HTTP-метод та локальний шлях у метадані функції.
`Router` обходить методи prototype контролера, читає ці метадані й склеює повний
шлях. Наприклад, `@Controller('users')` разом з `@Get(':id')` створюють маршрут
`GET /users/:id`.

`Dispatcher` працює поверх `node:http`: знаходить маршрут, читає JSON body,
збирає аргументи, отримує singleton-контролер із `Container`, викликає handler і
серіалізує результат у JSON. Жодного захардкодженого списку URL немає.

### Як параметр-декоратор знає, куди підставити значення

TypeScript викликає параметр-декоратор з `parameterIndex`. Тому `@Body()`,
`@Param('id')` і `@Query('limit')` зберігають у метаданих методу мапу на кшталт
`{ 0: { source: 'param', name: 'id' } }`. Під час запиту dispatcher читає цю
мапу, створює масив `args` і кладе значення саме за збереженим індексом. Після
цього виклик `handler.apply(controller, args)` передає кожне значення на
правильне місце. Сам декоратор нічого не дістає з HTTP-запиту — він лише описує,
що пізніше має зробити dispatcher.

Для `@Body()` router додатково читає `design:paramtypes` методу. Dispatcher
перетворює plain JSON на екземпляр DTO через `plainToInstance`, а
`ValidationPipe` викликає `class-validator`. Невалідне тіло дає `400` з усіма
полями та причинами; валідне надходить у handler як екземпляр DTO.

```ts
@Controller('users')
class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateUserDto) {
    return this.usersService.create(body);
  }
}
```

## Структура

- `src/container.ts` — рекурсивний IoC resolve і scopes.
- `src/decorators/injectable.ts`, `inject.ts` — DI-декоратори.
- `src/decorators/controller.ts` — `@Controller(prefix)`.
- `src/decorators/methods.ts` — `@Get()` та `@Post()`.
- `src/decorators/params.ts` — `@Body()`, `@Param()`, `@Query()`.
- `src/router.ts` — збір і пошук маршрутів із метаданих.
- `src/dispatcher.ts` — HTTP-диспетчер поверх `node:http`.
- `src/pipes/validation.pipe.ts` — перетворення та валідація DTO.
- `src/dto/create-user.dto.ts` — приклад DTO з правилами.
- `test/` — unit та HTTP integration tests.
