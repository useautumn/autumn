import { config } from "dotenv";
config({ path: "../server/.env" });
import { defineConfig } from "drizzle-kit";

console.log("DATABASE_URL", process.env.DATABASE_URL);

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
