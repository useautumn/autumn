import { describe, expect, test } from "bun:test";
import { redactDatabaseUrl } from "@/db/redactDatabaseUrl.js";

describe("redactDatabaseUrl", () => {
	test("redacts credentials and query string", () => {
		const redacted = redactDatabaseUrl(
			"postgres://user:secret@db.example.com:5432/autumn?sslmode=require",
		);

		expect(redacted).toMatch(
			/^postgres:\/\/u\*\*\*r:s\*\*\*t@db\.example\.com:5432\/autumn\?<redacted> #[a-f0-9]{12}$/,
		);
		expect(redacted).not.toContain("user");
		expect(redacted).not.toContain("secret");
		expect(redacted).not.toContain("sslmode=require");
	});

	test("does not echo invalid urls", () => {
		const redacted = redactDatabaseUrl("not a url with secret");

		expect(redacted).toMatch(/^<invalid database url> #[a-f0-9]{12}$/);
		expect(redacted).not.toContain("not a url with secret");
	});
});
