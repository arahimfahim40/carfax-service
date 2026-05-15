import { HttpException } from '@nestjs/common';

export function catch_response(err: any) {
  console.log(err);
  const prod: boolean = process.env.IS_PRODUCTION === 'true';
  if (prod) throw new HttpException('Serve Error', 500);
  else throw new HttpException(err.message, 500);
}