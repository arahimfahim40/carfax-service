import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@db';

let _adapter: PrismaPg | null = null;
let _prisma: PrismaClient | null = null;

export function createPrismaAdapter() {
  if (!_adapter) {
    const dbUrl = new URL(process.env.DATABASE_URL!);
    const schema = dbUrl.searchParams.get('schema') || 'public';
    dbUrl.searchParams.delete('schema');
    _adapter = new PrismaPg(
      {
        connectionString: dbUrl.toString(),
        options: `-c search_path=${schema} -c timezone=UTC`,
      },
      { schema },
    );
  }
  return _adapter;
}
//carfax_db
export function getStandalonePrisma() {
  if (!_prisma) {
    _prisma = new PrismaClient({ adapter: createPrismaAdapter() });
  }
  return _prisma;
}
