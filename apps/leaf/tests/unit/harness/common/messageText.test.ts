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

	test("echoes pending approval writes with the adjust guidance on a resumed session", () => {
		const request = {
			customer_id: "cus_1",
			enable_plan_immediately: true,
			invoice_mode: { enabled: true, finalize: false },
			plan_id: "startup",
		};
		const text = buildAgentMessageText({
			env: "live",
			newSession: false,
			params: { text: "finalize the invoice and provision after payment" },
			pendingApprovals: [{ writes: [{ request, toolName: "attach" }] }],
		});

		expect(text).toContain("Pending approval (awaiting the user's decision");
		expect(text).toContain(`attach: ${JSON.stringify(request)}`);
		expect(text).toContain(
			"If this message changes the request, re-preview and re-issue the write with the adjusted body; the old card withdraws automatically.",
		);
		expect(text.indexOf("Pending approval")).toBeLessThan(
			text.indexOf("<user_message>"),
		);
		expect(extractUserMessageText(text)).toBe(
			"finalize the invoice and provision after payment",
		);
	});

	test("lists every write of a batch card and numbers multiple cards", () => {
		const text = buildAgentMessageText({
			env: "live",
			newSession: false,
			params: { text: "make it $50" },
			pendingApprovals: [
				{
					writes: [
						{ request: { customer_id: "cus_1" }, toolName: "updateCustomer" },
						{
							request: { customer_id: "cus_1", plan_id: "pro" },
							toolName: "attach",
						},
					],
				},
				{ writes: [{ request: { customer_id: "cus_2" }, toolName: "attach" }] },
			],
		});

		expect(text).toContain("Pending approval 1 of 2 (awaiting");
		expect(text).toContain("Pending approval 2 of 2 (awaiting");
		expect(text).toContain('updateCustomer: {"customer_id":"cus_1"}');
		expect(text).toContain('attach: {"customer_id":"cus_1","plan_id":"pro"}');
		expect(text).toContain('attach: {"customer_id":"cus_2"}');
		expect(text.match(/re-preview and re-issue/g)).toHaveLength(1);
	});

	test("omits the pending approval note on the edit-details path and on a new session", () => {
		const pendingApprovals = [
			{ writes: [{ request: { customer_id: "cus_1" }, toolName: "attach" }] },
		];
		const editText = buildAgentMessageText({
			env: "live",
			newSession: false,
			params: {
				clientContext: { approvalEdit: { toolName: "attach", writes: [] } },
				text: "Preview this exact attach request and request approval again.",
			},
			pendingApprovals,
		});
		expect(editText).not.toContain("Pending approval");

		const freshText = buildAgentMessageText({
			env: "live",
			newSession: true,
			params: { text: "attach pro" },
			pendingApprovals,
		});
		expect(freshText).not.toContain("Pending approval");

		const noCardsText = buildAgentMessageText({
			env: "live",
			newSession: false,
			params: { text: "attach pro" },
			pendingApprovals: [],
		});
		expect(noCardsText).not.toContain("Pending approval");
	});

	test("extractUserMessageText returns the raw text when unwrapped", () => {
		expect(extractUserMessageText("just text")).toBe("just text");
	});
});
