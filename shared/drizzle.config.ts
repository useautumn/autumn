import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "../server/.env" });

export default defineConfig({
	dialect: "postgresql",
	out: "./drizzle",
	schema: "./db/schema.ts",
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
});
