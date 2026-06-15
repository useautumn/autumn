import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??=
	"postgresql://postgres:postgres@localhost:5432/postgres";
process.env.ENCRYPTION_PASSWORD ??= "test";
process.env.SLACK_CLIENT_ID ??= "test";
process.env.SLACK_CLIENT_SECRET ??= "test";
process.env.SLACK_SIGNING_SECRET ??= "test";
process.env.FIRECRAWL_API_KEY ??= "fc_test";

const { buildHarnessMessageText } = await import(
	"../../../../src/harness/common/messageText.js"
);

describe("Harness message text", () => {
	test("injects org context on a new session", () => {
		const text = buildHarnessMessageText({
			env: "sandbox",
			newSession: true,
			orgContext: { text: "Plans:\n- pro | Pro" },
			params: { text: "attach pro" },
		});

		expect(text).toContain("Org context:");
		expect(text).toContain("already-run Autumn tool results");
		expect(text).toContain(
			"Do not call getAgentRules, listPlans, or listFeatures again unless the needed record is absent or the user asks to refresh",
		);
		expect(text).toContain("- pro | Pro");
		expect(text.endsWith("attach pro")).toBe(true);
	});

	test("does not inject org context on resumed sessions", () => {
		const text = buildHarnessMessageText({
			env: "sandbox",
			newSession: false,
			orgContext: { text: "Plans:\n- pro | Pro" },
			params: { text: "attach pro" },
		});

		expect(text).not.toContain("Org context:");
		expect(text).not.toContain("- pro | Pro");
		expect(text.endsWith("attach pro")).toBe(true);
	});
});
