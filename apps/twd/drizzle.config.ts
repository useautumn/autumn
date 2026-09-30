import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/db/schema/schema.ts",
	out: "./src/db/migrations",
	dbCredentials: { url: process.env.TWD_DATABASE_URL ?? "" },
});
