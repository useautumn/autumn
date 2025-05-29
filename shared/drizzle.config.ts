import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./db/schema.ts",
  dbCredentials: {
    url: process.env.DEV_DATABASE_URL!,
  },
});
