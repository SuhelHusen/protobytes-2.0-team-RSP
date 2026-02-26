import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing. Add it to backend/.env.");
}

const useSsl =
  connectionString.includes("sslmode=require") ||
  connectionString.includes("ssl=true");

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

export async function testConnection(): Promise<void> {
  await pool.query("SELECT NOW()");
}

export default pool;
