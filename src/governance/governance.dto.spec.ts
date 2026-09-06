import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateChangeRequestDto } from './governance.dto';

describe('CreateChangeRequestDto', () => {
  it('accepts the category and details payload submitted by the vendor profile', async () => {
    const dto = plainToInstance(CreateChangeRequestDto, {
      category: 'Organisation details',
      details: 'Change Test ewihfuiehefioheiorfjeiofjioefioeqhfilqhfe',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
  });
});
