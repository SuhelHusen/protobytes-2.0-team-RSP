import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('❌ Unexpected DB pool error:', err);
});

export async function testConnection(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Database connected at', res.rows[0].now);
    return true;
  } catch (err: any) {
    console.error('❌ Database connection failed:', err.message);
    return false;
  }
}

export async function checkPgVector(): Promise<boolean> {
  try {
    await pool.query("SELECT 'test'::vector(3)");
    console.log('✅ pgvector extension available');
    return true;
  } catch {
    console.log('⚠️  pgvector not available — using in-memory vector store');
    return false;
  }
}

export default pool;
