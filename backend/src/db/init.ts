import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import pool from "./connection";

dotenv.config();

async function runSchema(): Promise<void> {
  const schemaPath = path.resolve(__dirname, "schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf-8");

  await pool.query(schemaSql);
  await pool.end();
}

runSchema()
  .then(() => {
    console.log("Database schema applied successfully.");
  })
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to apply schema: ${message}`);
    await pool.end().catch(() => {});
    process.exit(1);
  });
