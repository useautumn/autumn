import { defineConfig } from "drizzle-kit";

// Container-only drizzle config used at build time to generate a fresh schema.
// Output goes to /tmp/drizzle-gen inside the image — never touches the host.
// DATABASE_URL is not needed for generate (only for push/migrate).
export default defineConfig({
	dialect: "postgresql",
	out: "/tmp/drizzle-gen",
	schema: "/app/shared/db/schema.ts",
});
