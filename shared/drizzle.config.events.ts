import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "../server/.env" });

export default defineConfig({
	dialect: "postgresql",
	schema: "./models/eventModels/eventTableNeon.ts", // ONLY eventsNeon
	dbCredentials: {
		url: process.env.NEON_EVENTS_DATABASE_URL!,
	},
});
