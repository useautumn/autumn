/**
 * Multi-write scenario matrix. Each case sends one message, approves whatever
 * card(s) result, and verifies the outcome against REAL customer state — never
 * against card text, which has misled this flow before.
 *
 *   bun tests/e2e/multiWriteMatrix.e2e.ts            # all cases
 *   bun tests/e2e/multiWriteMatrix.e2e.ts customize  # cases whose name matches
 */
import { AppEnv, type ChatApproval } from "@autumn/shared";
import { resolveApproval } from "../../src/internal/approvals/actions/resolveApproval.js";
import { chatApprovalRepo } from "../../src/internal/approvals/repos/chatApprovalRepo.js";
import { executeAutumnMcpTool } from "../../src/internal/autumnMcp/client.js";
import { getInstallationOAuthAccessToken } from "../../src/internal/installations/actions/getInstallationOAuthAccessToken.js";
import { db } from "../../src/lib/db.js";
import { logger } from "../../src/lib/logger.js";
import { runSlackAgentTurn } from "../../src/providers/slack/actions/runSlackAgentTurn.js";
import type { SlackChatInstallation } from "../../src/providers/slack/domain/slackAgentTurn.js";
import { createEveSlackPresenter } from "../../src/providers/slack/evePresenter.js";
import { findInstallationWithOrg } from "../../src/providers/slack/installations.js";
import { createStatusTicker } from "../../src/ui/statusTicker.js";

const WORKSPACE_ID = process.env.E2E_SLACK_WORKSPACE ?? "T07NPTDCU69";
const filter = process.argv[2];
const runTag = Date.now().toString(36);
const fresh = (n: number) =>
	Array.from({ length: n }, (_, i) => `mx-${runTag}-${i + 1}`);

type Customer = {
	email?: string;
	subscriptions?: Array<{
		canceled_at?: number | null;
		plan_id: string;
		plan?: {
			items?: Array<{ feature_id?: string; included?: number }>;
			price?: { amount?: number } | null;
		};
	}>;
};

type Case = {
	name: string;
	message: string;
	/** Runs before the turn so each case starts from known state. */
	reset?: (tools: Tools) => Promise<void>;
	verify: (
		state: Record<string, Customer>,
		tools: Tools,
	) => Array<{ ok: boolean; name: string; detail?: string }>;
	customers: string[];
};

type Tools = {
	call: (
		toolName: string,
		request: Record<string, unknown>,
	) => Promise<unknown>;
	read: (customerId: string) => Promise<Customer>;
};

const installation = (await findInstallationWithOrg(
	"slack",
	WORKSPACE_ID,
)) as SlackChatInstallation | null;
if (!installation) throw new Error(`No slack installation for ${WORKSPACE_ID}`);
const providerUserId = installation.installed_by_provider_user_id ?? "";

const token = await getInstallationOAuthAccessToken({
	env: AppEnv.Sandbox,
	installation,
	orgId: installation.org_id,
});
const unwrap = (result: unknown): unknown => {
	const record = result as { content?: Array<{ text?: string }> };
	const text = record?.content?.[0]?.text;
	if (!text) return result;
	try {
		return JSON.parse(text);
	} catch {
		return result;
	}
};
const tools: Tools = {
	call: async (toolName, request) =>
		unwrap(
			await executeAutumnMcpTool({
				args: { request },
				env: AppEnv.Sandbox,
				token,
				toolName,
			}),
		),
	read: async (customerId) =>
		(await tools.call("getCustomer", {
			customer_id: customerId,
			expand: ["subscriptions.plan"],
			with_autumn_id: false,
		})) as Customer,
};

const makeTarget = () => ({
	post: async (content: unknown) => {
		const postable = content as {
			getPostData?: () => { stream: AsyncIterable<unknown> };
			kind?: string;
		};
		if (postable?.kind === "stream" && postable.getPostData) {
			for await (const _chunk of postable.getPostData().stream) {
				// drain
			}
		}
		return { id: "msg-1" };
	},
	startTyping: async () => {},
});

/** Runs the message, then approves every card that appears until the session
 * settles — grouped or sequential, all requested writes must land. */
const runAndApproveAll = async ({
	message,
	threadId,
}: {
	message: string;
	threadId: string;
}) => {
	const target = makeTarget();
	const ticker = createStatusTicker(target as never);
	const presenter = createEveSlackPresenter({ setStatus: ticker.activity });
	const output = await runSlackAgentTurn({
		channelId: threadId,
		installation,
		logger,
		onAction: (message) => presenter.onAction(message),
		onApprovalsSuperseded: () => {},
		onReasoning: presenter.onReasoning,
		onThinking: ticker.thinking,
		providerUserId,
		text: message,
		threadId,
	});
	ticker.stop();

	const approvedTools: string[] = [];
	const groupedCounts: number[] = [];
	const requests: string[] = [];
	if (output.kind !== "approval") {
		return {
			approvedTools,
			groupedCounts,
			kind: output.kind,
			requests,
			text: (output as { text?: string }).text,
		};
	}

	// Approve the first card, then keep approving chained cards.
	const { createApproval } = await import(
		"../../src/internal/approvals/actions/createApproval.js"
	);
	const first = await createApproval({
		channelId: threadId,
		env: AppEnv.Sandbox,
		getToken: async () => token,
		logger,
		orgId: installation.org_id,
		provider: installation.provider,
		providerUserId,
		turn: output as never,
		workspaceId: installation.workspace_id,
	});
	await first?.backfillGroupedPreviews?.();
	if (!first) throw new Error("createApproval returned nothing");
	let approvalId: string | undefined = first.approvalId;
	for (let hop = 0; approvalId && hop < 6; hop += 1) {
		const approval = (await chatApprovalRepo.get({
			approvalId,
			db,
		})) as ChatApproval;
		const grouped = ((approval.tool_args._eveWithheldWrites ?? []) as unknown[])
			.length;
		groupedCounts.push(grouped);
		approvedTools.push(approval.tool_name);
		const bodies = [
			{
				tool: approval.tool_name,
				request: (approval.tool_args as { request?: unknown }).request,
			},
			...(
				(approval.tool_args._eveWithheldWrites ?? []) as Array<{
					input?: { request?: unknown };
					toolName: string;
				}>
			).map((w) => ({ tool: w.toolName, request: w.input?.request })),
		];
		for (const body of bodies)
			requests.push(`${body.tool} ${JSON.stringify(body.request)}`);
		const claimed = await chatApprovalRepo.claim({
			approvalId,
			db,
			providerUserId,
		});
		const result = await resolveApproval({
			approval: claimed ?? approval,
			providerUserId,
		});
		if ("error" in result) {
			return {
				approvedTools,
				error: result.message,
				groupedCounts,
				kind: "approval",
				requests,
			};
		}
		approvalId =
			"chainedApprovalId" in result ? result.chainedApprovalId : undefined;
	}
	return { approvedTools, groupedCounts, kind: "approval", requests };
};

/** Every case gets brand-new customers, so nothing bleeds between cases and
 * no detach is needed — subscriptions created against a previous seed cannot
 * be updated (Autumn rejects them as not-Autumn-created). */
const createFreshCustomers = async (ids: string[]) => {
	for (const [index, id] of ids.entries()) {
		await tools.call("getOrCreateCustomer", {
			create_in_stripe: true,
			customer_id: id,
			email: `${id}@example.com`,
			name: `Case ${index + 1} ${id}`,
			with_autumn_id: false,
		});
	}
};

const planOn = (customer: Customer, planId: string) =>
	(customer.subscriptions ?? []).find((sub) => sub.plan_id === planId);

let caseIndex = 0;
/** Each case gets its own id block so no state bleeds between cases. */
const freshFor = (n: number) => {
	caseIndex += 1;
	return Array.from(
		{ length: n },
		(_, i) => `mx-${runTag}-c${caseIndex}-${i + 1}`,
	);
};

const buildCases = (): Case[] => {
	const fanOut = freshFor(4);
	const custom = freshFor(4);
	const [custom1, custom2, custom3] = custom;
	const [addFeat] = freshFor(1);
	const [au1, au2] = freshFor(2);
	const [mixed1] = freshFor(1);
	return [
		{
			name: "fan-out: same plan to four customers",
			customers: fanOut,
			message: `attach the scale plan to ${fanOut.join(", ")}`,
			verify: (state) =>
				fanOut.map((id) => ({
					name: `${id} has scale`,
					ok: Boolean(planOn(state[id] ?? {}, "scale")),
				})),
		},
		{
			name: "customize: fan-out with a per-customer base price override",
			customers: custom,
			message: `attach the scale plan to ${custom.join(", ")}, but for ${custom1} and ${custom2} customize the base price to $1000`,
			verify: (state) => [
				...custom.map((id) => ({
					name: `${id} has scale`,
					ok: Boolean(planOn(state[id] ?? {}, "scale")),
				})),
				{
					name: `${custom1} base price is 1000`,
					ok:
						planOn(state[custom1] ?? {}, "scale")?.plan?.price?.amount === 1000,
					detail: String(
						planOn(state[custom1] ?? {}, "scale")?.plan?.price?.amount,
					),
				},
				{
					name: `${custom3} base price is the default 500`,
					ok:
						planOn(state[custom3] ?? {}, "scale")?.plan?.price?.amount === 500,
					detail: String(
						planOn(state[custom3] ?? {}, "scale")?.plan?.price?.amount,
					),
				},
			],
		},
		{
			name: "customize: add a feature item to one customer's plan",
			customers: [addFeat],
			message: `attach the scale plan to ${addFeat} and add 50 member_slots to it as an included item`,
			verify: (state) => {
				const sub = planOn(state[addFeat] ?? {}, "scale");
				const slots = sub?.plan?.items?.find(
					(item) => item.feature_id === "member_slots",
				);
				return [
					{ name: `${addFeat} has scale`, ok: Boolean(sub) },
					{
						name: "scale carries the member_slots item",
						ok: Boolean(slots),
						detail: JSON.stringify(
							sub?.plan?.items?.map((item) => item.feature_id),
						),
					},
				];
			},
		},
		{
			name: "attach + update: attach to one customer, update another",
			customers: [au1, au2],
			reset: async () => {
				await tools.call("attach", {
					customer_id: au2,
					invoice_mode: {
						enable_plan_immediately: true,
						enabled: true,
						finalize: false,
					},
					plan_id: "launch",
					redirect_mode: "never",
				});
			},
			message: `attach the scale plan to ${au1}, and cancel ${au2}'s launch plan at the end of the cycle`,
			verify: (state) => [
				{
					name: `${au1} has scale`,
					ok: Boolean(planOn(state[au1] ?? {}, "scale")),
				},
				{
					name: `${au2} launch is set to cancel`,
					ok: Boolean(planOn(state[au2] ?? {}, "launch")?.canceled_at),
					detail: JSON.stringify(
						planOn(state[au2] ?? {}, "launch")?.canceled_at,
					),
				},
			],
		},
		{
			name: "mixed: update email then attach, same customer",
			customers: [mixed1],
			message: `update ${mixed1} email to mixed+${runTag}@example.com and then attach the launch plan`,
			verify: (state) => [
				{
					name: `${mixed1} email changed`,
					ok: Boolean(state[mixed1]?.email?.startsWith("mixed+")),
					detail: state[mixed1]?.email,
				},
				{
					name: `${mixed1} has launch`,
					ok: Boolean(planOn(state[mixed1] ?? {}, "launch")),
				},
			],
		},
	];
};
const cases = buildCases();

const selected = filter ? cases.filter((c) => c.name.includes(filter)) : cases;
let passed = 0;
let total = 0;
for (const testCase of selected) {
	console.log(`\n▶ ${testCase.name}`);
	await createFreshCustomers(testCase.customers);
	if (testCase.reset) await testCase.reset(tools);
	const threadId = `matrix-${Date.now().toString(36)}`;
	const run = await runAndApproveAll({ message: testCase.message, threadId });
	console.log(
		`   cards=${run.approvedTools.length} tools=[${run.approvedTools.join(", ")}] grouped=[${run.groupedCounts.join(",")}]${run.error ? ` error=${run.error}` : ""}${run.kind !== "approval" ? ` kind=${run.kind} text=${run.text?.slice(0, 120)}` : ""}`,
	);
	if (run.requests?.length) {
		for (const request of run.requests) console.log(`   request: ${request}`);
	}
	const state: Record<string, Customer> = {};
	for (const id of testCase.customers) state[id] = await tools.read(id);
	for (const check of testCase.verify(state, tools)) {
		total += 1;
		if (check.ok) passed += 1;
		console.log(
			`   ${check.ok ? "✅" : "❌"} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`,
		);
	}
}
console.log(`\n${passed}/${total} checks passed`);
process.exit(passed === total ? 0 : 1);
