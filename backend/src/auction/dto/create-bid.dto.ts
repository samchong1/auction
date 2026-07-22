import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, IsInt, Min, Max, IsOptional, IsUUID } from 'class-validator';

export class CreateBidDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsString()
  @IsNotEmpty()
  bidderName: string;

  @Type(() => Number)
  @IsInt({ message: 'amount must be a whole integer' })
  @Min(1, { message: 'amount must be at least 1' })
  @Max(9999999999999, { message: 'amount must be at most 9999999999999' })
  @IsNotEmpty()
  amount: number;
}
