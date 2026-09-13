import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateChangeRequestDto } from './governance.dto';

describe('CreateChangeRequestDto', () => {
  it('accepts the structured field change submitted by the vendor profile', async () => {
    const dto = plainToInstance(CreateChangeRequestDto, {
      category: 'Organisation details',
      details: 'Change Test ewihfuiehefioheiorfjeiofjioefioeqhfilqhfe',
      requestedChanges: { field: 'companyName', proposedValue: 'New legal name' },
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
  });
});
