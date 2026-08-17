import { describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??=
	"postgresql://postgres:postgres@localhost:5432/postgres";
process.env.ENCRYPTION_PASSWORD ??= "test";
process.env.SLACK_CLIENT_ID ??= "test";
process.env.SLACK_CLIENT_SECRET ??= "test";
process.env.SLACK_SIGNING_SECRET ??= "test";

const { buildAgentMessageText, extractUserMessageText } = await import(
	"../../../../src/internal/agentRuntime/messages/agentMessageText.js"
);

describe("Harness message text", () => {
	test("injects org context on a new session", () => {
		const text = buildAgentMessageText({
			env: "sandbox",
			newSession: true,
			orgContext: { text: "Plans:\n- pro | Pro" },
			params: { text: "attach pro" },
		});

		expect(text).toContain("Org context");
		expect(text).toContain("Autumn tool results you already ran this session");
		expect(text).toContain(
			"Do NOT call getAgentRules, listPlans, or listFeatures again",
		);
		expect(text).toContain("- pro | Pro");
		expect(extractUserMessageText(text)).toBe("attach pro");
	});

	test("does not inject org context on resumed sessions", () => {
		const text = buildAgentMessageText({
			env: "sandbox",
			newSession: false,
			orgContext: { text: "Plans:\n- pro | Pro" },
			params: { text: "attach pro" },
		});

		expect(text).not.toContain("Org context:");
		expect(text).not.toContain("- pro | Pro");
		expect(extractUserMessageText(text)).toBe("attach pro");
	});

	test("extractUserMessageText returns the raw text when unwrapped", () => {
		expect(extractUserMessageText("just text")).toBe("just text");
	});
});
