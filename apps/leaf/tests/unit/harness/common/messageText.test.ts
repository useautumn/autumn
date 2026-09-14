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
	test("names the speaker on every turn", () => {
		const text = buildAgentMessageText({
			env: "sandbox",
			newSession: false,
			params: {
				speaker: { email: "aneil@example.com", name: "Aneil Singh" },
				text: "yep, we're good!",
			},
		});

		expect(text).toContain("Speaker: Aneil Singh (aneil@example.com)");
		expect(text).toContain("Delivery is conditional");
		expect(text).toContain("<eve-empty-delivery/>");
		expect(text).not.toContain("@-mentions someone else");
		expect(extractUserMessageText(text)).toBe("yep, we're good!");
	});

	test("does not make delivery conditional on a thread's first turn", () => {
		const text = buildAgentMessageText({
			env: "sandbox",
			newSession: true,
			params: {
				speaker: { name: "Aneil Singh" },
				text: "please update their enterprise billing",
			},
		});

		expect(text).toContain("Speaker: Aneil Singh");
		expect(text).not.toContain("Delivery is conditional");
	});

	test("flags a message that mentions someone else and not the agent", () => {
		const text = buildAgentMessageText({
			env: "sandbox",
			newSession: false,
			params: {
				speaker: {
					mentionsAgent: false,
					mentionsOthers: true,
					name: "Aneil Singh",
				},
				text: "@Ayush any support here",
			},
		});

		expect(text).toContain("Speaker: Aneil Singh");
		expect(text).toContain("@-mentions someone else in the thread, not you");
		expect(text).toContain("reply with exactly <eve-empty-delivery/>");
	});

	test("does not flag a message that mentions the agent alongside others", () => {
		const text = buildAgentMessageText({
			env: "sandbox",
			newSession: false,
			params: {
				speaker: {
					mentionsAgent: true,
					mentionsOthers: true,
					name: "Aneil Singh",
				},
				text: "@Autumn @Ayush approved, apply it",
			},
		});

		expect(text).not.toContain("@-mentions someone else");
	});

	test("injects org context on a new session", () => {
		const text = buildAgentMessageText({
			env: "sandbox",
			newSession: true,
			orgContext: { text: "Plans:\n- pro | Pro" },
			params: { text: "attach pro" },
		});

		expect(text).toContain("Org context");
		expect(text).toContain("treat these JSON blocks as the current org state");
		expect(text).toContain(
			"look it up with the Autumn tools instead of guessing",
		);
		expect(text).toContain("- pro | Pro");
		expect(extractUserMessageText(text)).toBe("attach pro");
	});

	test("adds the admin note only for admin installs on a new session", () => {
		const adminText = buildAgentMessageText({
			env: "sandbox",
			isAdminInstall: true,
			newSession: true,
			params: { text: "who am I acting as" },
		});
		expect(adminText).toContain("internal admin bot");

		const nonAdminText = buildAgentMessageText({
			env: "sandbox",
			isAdminInstall: false,
			newSession: true,
			params: { text: "who am I acting as" },
		});
		expect(nonAdminText).not.toContain("internal admin bot");

		const resumedAdminText = buildAgentMessageText({
			env: "sandbox",
			isAdminInstall: true,
			newSession: false,
			params: { text: "who am I acting as" },
		});
		expect(resumedAdminText).not.toContain("internal admin bot");
	});

	test("interpolates the acting-as org slug into the admin note and won't redirect for the current org", () => {
		const text = buildAgentMessageText({
			env: "sandbox",
			isAdminInstall: true,
			newSession: true,
			orgSlug: "acme_sandbox",
			params: { text: 'use "acme_sandbox" org' },
		});
		expect(text).toContain("acme_sandbox");
		expect(text).toContain("do NOT tell them to start a new thread");
		expect(text).toContain("now acting as");
		expect(text).toContain("Only if they ask for a DIFFERENT org");
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
