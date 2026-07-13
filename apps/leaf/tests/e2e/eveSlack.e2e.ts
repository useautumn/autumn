/**
 * End-to-end exercise of the Slack eve flow against the local dev stack
 * (eve :3999, main server :8080, local postgres). Everything is real except
 * the Slack transport: a fake target captures posts and consumes streams.
 *
 * Run from apps/leaf:
 *   SLACK_AGENT_HARNESS=eve ... bun tests/e2e/eveSlack.e2e.ts
 */
import { buildCatalogDecisionModel, parsePreviewPayload } from "@autumn/render";
import type { ChatApproval } from "@autumn/shared";
import { AppEnv } from "@autumn/shared";
import { runMessage } from "../../src/agent/runMessage/runMessage.js";
import {
	answerEveQuestion,
	denyEveApproval,
} from "../../src/harness/eve/approval.js";
import { redirectCatalogSuspensionToDecision } from "../../src/harness/eve/catalogDecision.js";
import { resolveApproval } from "../../src/internal/approvals/actions/resolveApproval.js";
import { chatApprovalRepo } from "../../src/internal/approvals/repos/chatApprovalRepo.js";
import { presentApproval } from "../../src/internal/approvals/surfaces/slack/present.js";
import { executeAutumnMcpTool } from "../../src/internal/autumnMcp/client.js";
import { getInstallationOAuthAccessToken } from "../../src/internal/installations/actions/getInstallationOAuthAccessToken.js";
import { db } from "../../src/lib/db.js";
import { logger } from "../../src/lib/logger.js";
import { createEveSlackPresenter } from "../../src/providers/slack/evePresenter.js";
import { findInstallationWithOrg } from "../../src/providers/slack/installations.js";
import type { LeafChatInstallation } from "../../src/types.js";
import { catalogDecisionCard } from "../../src/ui/eveCards.js";
import { createStatusTicker } from "../../src/ui/statusTicker.js";

const WORKSPACE_ID = process.env.E2E_SLACK_WORKSPACE ?? "T07NPTDCU69";
const USER_A = "U_E2E_ALICE";
const USER_B = "U_E2E_BOB";
const RUN_TAG = Date.now().toString(36);

const RED_PIXEL_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
	"base64",
);

type CheckResult = { detail?: string; name: string; ok: boolean };
const results: CheckResult[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
	results.push({ detail, name, ok });
	console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

type PostedItem = {
	chunks?: unknown[];
	content: unknown;
	kind: "message" | "stream";
};

const makeTarget = () => {
	const posted: PostedItem[] = [];
	const statuses: string[] = [];
	return {
		posted,
		statuses,
		post: async (content: unknown) => {
			const postable = content as {
				kind?: string;
				getPostData?: () => { stream: AsyncIterable<unknown> };
			};
			if (postable?.kind === "stream" && postable.getPostData) {
				const chunks: unknown[] = [];
				for await (const chunk of postable.getPostData().stream) {
					chunks.push(chunk);
				}
				posted.push({ chunks, content: null, kind: "stream" });
				return { id: `msg-${posted.length}` };
			}
			posted.push({ content, kind: "message" });
			return { id: `msg-${posted.length}` };
		},
		startTyping: async (text?: string) => {
			if (text) statuses.push(text);
		},
	};
};

// Mirrors bot.ts's runAndReply wiring, minus the Slack transport.
const runTurn = async ({
	attachments,
	clientContext,
	installation,
	providerUserId = USER_A,
	recentMessages,
	text,
	threadId,
}: {
	attachments?: { data: Buffer; mimeType: string; name?: string }[];
	clientContext?: Record<string, unknown>;
	installation: LeafChatInstallation;
	providerUserId?: string;
	recentMessages?: { author: string; isBot: boolean; text: string }[];
	text: string;
	threadId: string;
}) => {
	const target = makeTarget();
	const ticker = createStatusTicker(target as never);
	const presenter = createEveSlackPresenter({ ticker });
	const superseded: ChatApproval[] = [];
	const output = await runMessage({
		attachments: attachments?.map((attachment) => ({
			data: attachment.data,
			mimeType: attachment.mimeType,
			name: attachment.name,
			size: attachment.data.byteLength,
			type: "file" as const,
		})),
		channelId: threadId,
		clientContext,
		installation,
		logger,
		onAction: (message) => presenter.onAction(message),
		onActionKeyed: ({ message }) => presenter.onActionError(message),
		onApprovalsSuperseded: (approvals) => {
			superseded.push(...approvals);
		},
		onReasoning: presenter.onReasoning,
		onThinking: ticker.thinking,
		providerUserId,
		recentMessages,
		text,
		threadId,
	});
	ticker.stop();
	return { output, superseded, target };
};

const mcpJson = async ({
	args,
	toolName,
	token,
}: {
	args: Record<string, unknown>;
	toolName: string;
	token: string;
}) => {
	const result = await executeAutumnMcpTool({
		args,
		env: AppEnv.Sandbox,
		token,
		toolName,
	});
	return parsePreviewPayload(result);
};

const pendingApprovalForRun = async ({
	channelId,
	installation,
	runId,
}: {
	channelId: string;
	installation: LeafChatInstallation;
	runId: string;
}) =>
	(
		await chatApprovalRepo.listPendingForRun({
			channelId,
			db,
			env: AppEnv.Sandbox,
			orgId: installation.org_id,
			provider: installation.provider,
			runId,
			workspaceId: installation.workspace_id,
		})
	)[0];

const main = async () => {
	console.log(`\n=== Slack eve e2e (tag ${RUN_TAG}) ===\n`);
	const installation = (await findInstallationWithOrg(
		"slack",
		WORKSPACE_ID,
	)) as LeafChatInstallation | null;
	if (!installation) {
		throw new Error(`No slack installation for workspace ${WORKSPACE_ID}`);
	}
	console.log(`Installation org=${installation.org_id}`);
	const token = await getInstallationOAuthAccessToken({
		installation,
		env: AppEnv.Sandbox,
		orgId: installation.org_id,
	});

	// ---- fixtures ----
	const plansPayload = await mcpJson({
		args: {},
		toolName: "listPlans",
		token,
	});
	const plans = (plansPayload?.plans ?? plansPayload?.list ?? []) as Record<
		string,
		unknown
	>[];
	const customersPayload = await mcpJson({
		args: { request: { limit: 5, start_cursor: "" } },
		toolName: "listCustomers",
		token,
	});
	const customers = (customersPayload?.customers ??
		customersPayload?.list ??
		customersPayload?.results ??
		[]) as Record<string, unknown>[];
	if (plans.length === 0 || customers.length === 0) {
		throw new Error(
			`Need at least one plan (${plans.length}) and customer (${customers.length}) in sandbox`,
		);
	}
	// Prefer e2e-owned customers with an email (invoice-mode billing requires
	// one) and an existing subscription; server test fixtures (test clocks,
	// trials) and half-created manual customers derail the billing scenarios.
	const usable = (candidate: Record<string, unknown>) =>
		Boolean(candidate.email) &&
		((candidate.subscriptions as unknown[]) ?? []).length > 0;
	const customer =
		customers.find(
			(candidate) =>
				String(candidate.id).startsWith("e2e") && usable(candidate),
		) ??
		customers.find(usable) ??
		customers.find((candidate) => Boolean(candidate.email)) ??
		customers[0];
	const customerId = String(customer.id ?? customer.customer_id);
	const attachedPlanIds = new Set(
		((customer.subscriptions ?? []) as { plan_id?: string }[]).map(
			(subscription) => String(subscription.plan_id),
		),
	);
	const planIds = plans
		.map((plan) => String(plan.id ?? plan.plan_id))
		.filter((id) => !(id.includes("test") || id.includes("trial")));
	// Attach must target a plan the customer doesn't already have, or the model
	// (correctly) does nothing.
	const planId = planIds.find((id) => !attachedPlanIds.has(id)) ?? planIds[0];
	const secondPlanId =
		planIds.find((id) => id !== planId && !attachedPlanIds.has(id)) ??
		planIds.find((id) => id !== planId) ??
		planId;
	// The decision flow needs a plan with customers/variants — one they're on.
	// Prefer the base plan (shortest id) over its variants, which may not be
	// independently versionable.
	const decisionPlanId =
		planIds
			.filter((id) => attachedPlanIds.has(id))
			.sort((a, b) => a.length - b.length)[0] ?? planId;
	console.log(
		`Fixtures: plan=${planId} altPlan=${secondPlanId} decisionPlan=${decisionPlanId} customer=${customerId} (already on: ${[...attachedPlanIds].join(",") || "none"})\n`,
	);

	// ---- S1: plain question, streamed ----
	{
		console.log("--- S1: plain question streams tasks + final text");
		const threadId = `e2e-${RUN_TAG}-s1`;
		const turn = await runTurn({
			installation,
			text: "In sandbox: how many plans do we have? Answer in one sentence.",
			threadId,
		});
		check(
			"S1 run produced text",
			Boolean(turn.output.text?.trim()),
			turn.output.text?.slice(0, 120),
		);
		// Tool activity lives in the assistant status line, never posted cards.
		check(
			"S1 progress went to the status line",
			turn.target.statuses.length > 0,
			turn.target.statuses.slice(0, 4).join(" | "),
		);
		check(
			"S1 no card/messages posted mid-run",
			turn.target.posted.length === 0,
			`posted=${turn.target.posted.length}`,
		);
	}

	// ---- S2: attach → approval card → approve → applied ----
	const s2ThreadId = `e2e-${RUN_TAG}-s2`;
	{
		console.log("--- S2: attach flow with approval card + approve");
		const turn = await runTurn({
			installation,
			text: `In sandbox: attach the plan "${planId}" to customer "${customerId}". Use default options, effective immediately — this is intentional even if it's a downgrade, so don't ask me anything, just proceed.`,
			threadId: s2ThreadId,
		});
		check(
			"S2 suspended on a gated write",
			Boolean(turn.output.suspension),
			turn.output.suspension?.toolName ??
				`text: ${turn.output.text?.slice(0, 160)}`,
		);
		if (turn.output.suspension) {
			const target = makeTarget();
			const posted = await presentApproval({
				channelId: s2ThreadId,
				installation,
				loading: null,
				logAction: () => undefined,
				logger,
				orgId: installation.org_id,
				output: turn.output,
				providerUserId: USER_A,
				target: target as never,
			});
			check("S2 approval card posted", posted === true);
			const cardJson = JSON.stringify(target.posted.at(-1)?.content ?? {});
			check(
				"S2 card has receipt/money facts",
				/Due (now|today)|No charge now/.test(cardJson),
				cardJson.slice(0, 300),
			);
			check("S2 card has params badges", cardJson.includes("Prorations"));

			const approval = await pendingApprovalForRun({
				channelId: s2ThreadId,
				installation,
				runId: turn.output.runId ?? "",
			});
			check("S2 approval row exists", Boolean(approval));
			if (approval) {
				const claimed = await chatApprovalRepo.claim({
					approvalId: approval.id,
					db,
					providerUserId: USER_B,
				});
				check("S2 another user can claim/approve", Boolean(claimed));
				const result = await resolveApproval({
					approval: claimed ?? approval,
					providerUserId: USER_B,
				});
				const failed = "error" in result && result.error === true;
				check(
					"S2 approve executed",
					!failed,
					failed
						? String((result as { message: string }).message)
						: (result as { text: string }).text?.slice(0, 120),
				);
				const updated = await mcpJson({
					args: {
						request: { customer_id: customerId, with_autumn_id: false },
					},
					toolName: "getCustomer",
					token,
				});
				const customerJson = JSON.stringify(updated ?? {});
				check(
					"S2 plan actually attached",
					customerJson.includes(planId),
					customerJson.slice(0, 200),
				);
			}
		}
	}

	// ---- S3: pending approval superseded by a new message ----
	{
		console.log("--- S3: message after approval supersedes it");
		const threadId = `e2e-${RUN_TAG}-s3`;
		const first = await runTurn({
			installation,
			text: `In sandbox: update customer "${customerId}"'s subscription to plan "${secondPlanId}". Use defaults.`,
			threadId,
		});
		check(
			"S3 first turn suspended",
			Boolean(first.output.suspension),
			first.output.suspension?.toolName ??
				`text: ${first.output.text?.slice(0, 160)}`,
		);
		// The real bot flow always inserts the approval row via presentApproval
		// before the next message can supersede it.
		if (first.output.suspension) {
			const cardTarget = makeTarget();
			await presentApproval({
				channelId: threadId,
				installation,
				loading: null,
				logAction: () => undefined,
				logger,
				orgId: installation.org_id,
				output: first.output,
				providerUserId: USER_A,
				target: cardTarget as never,
			});
		}
		const second = await runTurn({
			installation,
			recentMessages: [{ author: "bot", isBot: true, text: "…" }],
			text: "Actually hold off on that — don't change anything yet. Just confirm you've cancelled it.",
			threadId,
		});
		check(
			"S3 pending approval was superseded",
			second.superseded.length > 0,
			`superseded=${second.superseded.length}`,
		);
		// Valid outcomes: a reply, a question, or a rebuilt gated write (the
		// supersede note tells the model to rebuild with the adjustment) — each
		// renders on Slack (text, chips, or a fresh approval card).
		check(
			"S3 follow-up turn completed",
			Boolean(
				second.output.text?.trim() ||
					second.output.question ||
					second.output.suspension,
			),
			second.output.suspension
				? `rebuilt write: ${second.output.suspension.toolName}`
				: (second.output.text?.slice(0, 120) ??
						second.output.question?.prompt?.slice(0, 120)),
		);
	}

	// ---- S4: dismiss (deny) unwedges the session ----
	{
		console.log("--- S4: dismiss denies the parked call in eve");
		const threadId = `e2e-${RUN_TAG}-s4`;
		const first = await runTurn({
			installation,
			text: `In sandbox: update customer "${customerId}"'s subscription to plan "${secondPlanId}". Use defaults.`,
			threadId,
		});
		check(
			"S4 first turn suspended",
			Boolean(first.output.suspension),
			first.output.suspension?.toolName ??
				`text: ${first.output.text?.slice(0, 160)}`,
		);
		if (first.output.suspension) {
			const cardTarget = makeTarget();
			await presentApproval({
				channelId: threadId,
				installation,
				loading: null,
				logAction: () => undefined,
				logger,
				orgId: installation.org_id,
				output: first.output,
				providerUserId: USER_A,
				target: cardTarget as never,
			});
		}
		const approval = first.output.runId
			? await pendingApprovalForRun({
					channelId: threadId,
					installation,
					runId: first.output.runId,
				})
			: undefined;
		check("S4 approval row exists", Boolean(approval));
		if (approval) {
			const denied = await denyEveApproval({
				approval,
				providerUserId: USER_A,
			});
			check(
				"S4 deny succeeded",
				!("error" in denied && denied.error),
				"text" in denied ? denied.text?.slice(0, 120) : undefined,
			);
			await chatApprovalRepo.cancel({
				approvalId: approval.id,
				db,
				providerUserId: USER_A,
			});
			const followUp = await runTurn({
				installation,
				recentMessages: [{ author: "bot", isBot: true, text: "…" }],
				text: "No changes then. In one sentence: which plan is that customer currently on?",
				threadId,
			});
			check(
				"S4 session not wedged after dismiss",
				Boolean(followUp.output.text?.trim()),
				followUp.output.text?.slice(0, 120),
			);
		}
	}

	// ---- S5: question with option buttons ----
	{
		console.log("--- S5: ask_question renders options; button answer resumes");
		const threadId = `e2e-${RUN_TAG}-s5`;
		const turn = await runTurn({
			installation,
			text: "In sandbox: before doing anything, use your ask_question tool to ask me whether I prefer 'Apple' or 'Banana'. Offer exactly those two options.",
			threadId,
		});
		check(
			"S5 turn returned a structured question",
			Boolean(turn.output.question),
			turn.output.question?.prompt?.slice(0, 100),
		);
		if (turn.output.question && turn.output.runId) {
			const option = turn.output.question.options[0];
			const answer = await answerEveQuestion({
				auth: {
					appEnv: AppEnv.Sandbox,
					channelId: threadId,
					orgId: installation.org_id,
					provider: installation.provider,
					providerUserId: USER_B,
					threadId,
					workspaceId: installation.workspace_id,
				},
				optionId: option.id ?? option.label ?? "",
				orgId: installation.org_id,
				requestId: turn.output.question.requestId,
				sessionId: turn.output.runId,
			});
			check(
				"S5 button answer resumed the session",
				!("error" in answer),
				"text" in answer
					? answer.text?.slice(0, 120)
					: (answer as { message: string }).message,
			);
		}
	}

	// ---- S6: image attachment reaches the model ----
	{
		console.log("--- S6: image attachment");
		const threadId = `e2e-${RUN_TAG}-s6`;
		const turn = await runTurn({
			attachments: [
				{ data: RED_PIXEL_PNG, mimeType: "image/png", name: "pixel.png" },
			],
			installation,
			text: "In sandbox (no tools needed): what color is the attached image? Answer with just the color name.",
			threadId,
		});
		// File ingestion is flag-gated off (upstream eve queue bug corrupts
		// bytes) — the graceful path acknowledges the file instead of failing.
		const text = turn.output.text ?? "";
		check(
			"S6 attachment acknowledged gracefully (or seen, if flag on)",
			/red/i.test(text) || /pixel\.png|image|file/i.test(text),
			text.slice(0, 140),
		);
		check("S6 turn completed (no hard failure)", Boolean(text.trim()));
	}

	// ---- S7: second user in the same thread ----
	{
		console.log("--- S7: multi-user thread");
		const followUp = await runTurn({
			installation,
			providerUserId: USER_B,
			recentMessages: [{ author: "bot", isBot: true, text: "…" }],
			text: "Different person here — in one sentence, which plan does that customer have now?",
			threadId: s2ThreadId,
		});
		// A no-tool turn may never open a stream; the bot then posts the text as
		// a plain message — that's the correct fallback, not a failure.
		check(
			"S7 second user's turn completed on the same session",
			Boolean(followUp.output.text?.trim()),
			followUp.output.text?.slice(0, 120),
		);
	}

	// ---- S8: catalog change needing decisions → decision card (no write) ----
	{
		console.log("--- S8: catalog decision card path");
		const threadId = `e2e-${RUN_TAG}-s8`;
		const turn = await runTurn({
			installation,
			text: `In sandbox: change the base price of plan "${decisionPlanId}" to be $1 higher than it currently is. Proceed without asking me anything, and don't pass any versioning/variant/migration options — just the price change.`,
			threadId,
		});
		const hasGate = Boolean(
			turn.output.suspension || turn.output.catalogDecision,
		);
		check(
			"S8 catalog change gated (suspension or decision)",
			hasGate,
			turn.output.suspension?.toolName ??
				(turn.output.catalogDecision ? "catalogDecision" : "none"),
		);
		let plan = turn.output.catalogDecision?.plan as
			| Parameters<typeof buildCatalogDecisionModel>[0]["plan"]
			| undefined;
		if (!plan && turn.output.suspension) {
			plan = await redirectCatalogSuspensionToDecision({
				decisionProvided: false,
				env: AppEnv.Sandbox,
				logger,
				orgId: installation.org_id,
				providerUserId: USER_A,
				runId: turn.output.runId,
				suspension: turn.output.suspension,
				thread: {
					channelId: threadId,
					provider: installation.provider as never,
					threadId,
					workspaceId: installation.workspace_id,
				},
				token,
			});
		}
		// Ground truth: does a flag-forced preview say this plan needs decisions?
		// (Earlier scenarios may have moved the customer off the fixture plan, in
		// which case NOT redirecting is the correct outcome.)
		let groundTruthNeedsDecision = false;
		if (!plan && turn.output.suspension) {
			const args = turn.output.suspension.toolArgs as {
				request?: { plans?: Record<string, unknown>[] };
			};
			const request = args.request ?? {};
			const previewPayload = await mcpJson({
				args: {
					request: {
						...request,
						plans: (request.plans ?? []).map((planArgs) => ({
							...planArgs,
							include_variants: true,
							include_versions: true,
						})),
					},
				},
				token,
				toolName: "previewUpdateCatalog",
			});
			const planChanges = (previewPayload?.plan_changes ?? []) as Parameters<
				typeof buildCatalogDecisionModel
			>[0]["plan"][];
			groundTruthNeedsDecision = planChanges.some(
				(change) => buildCatalogDecisionModel({ plan: change }).needsDecision,
			);
		}
		check(
			"S8 decision routing matches preview ground truth",
			Boolean(plan) || !groundTruthNeedsDecision,
			plan
				? `decision card for ${plan.plan_id}`
				: `no decision needed for this fixture (correctly fell through to approval card)`,
		);
		if (plan) {
			const model = buildCatalogDecisionModel({ plan });
			const card = catalogDecisionCard({
				env: AppEnv.Sandbox,
				model,
				orgId: installation.org_id,
				plan,
			});
			const cardJson = JSON.stringify(card);
			check(
				"S8 decision card offers versioning choices",
				cardJson.includes("Create new version") &&
					cardJson.includes("Update current version"),
			);
		} else if (turn.output.suspension) {
			// No decision needed → the real flow posts an approval card; dismiss it
			// so the parked write is denied and nothing is applied.
			const cardTarget = makeTarget();
			await presentApproval({
				channelId: threadId,
				installation,
				loading: null,
				logAction: () => undefined,
				logger,
				orgId: installation.org_id,
				output: turn.output,
				providerUserId: USER_A,
				target: cardTarget as never,
			});
			const approval = turn.output.runId
				? await pendingApprovalForRun({
						channelId: threadId,
						installation,
						runId: turn.output.runId,
					})
				: undefined;
			if (approval) {
				await denyEveApproval({ approval, providerUserId: USER_A });
				await chatApprovalRepo.cancel({
					approvalId: approval.id,
					db,
					providerUserId: USER_A,
				});
			}
		}
		// Nothing was applied either way. Confirm the session still answers.
		const followUp = await runTurn({
			installation,
			recentMessages: [{ author: "bot", isBot: true, text: "…" }],
			text: "Leave the price as is — do not apply anything. Just say 'ok'.",
			threadId,
		});
		check(
			"S8 session healthy after decision routing",
			Boolean(followUp.output.text?.trim()),
			followUp.output.text?.slice(0, 120),
		);
	}

	// ---- S9: bare prepaid amounts mean feature_quantities, never item edits ----
	{
		console.log("--- S9: prepaid quantity phrasing");
		// Find a plan that prices a feature as prepaid.
		let prepaidPlanId: string | undefined;
		let prepaidFeatureId: string | undefined;
		for (const candidate of planIds.slice(0, 6)) {
			const planPayload = await mcpJson({
				args: { request: { plan_id: candidate } },
				toolName: "getPlan",
				token,
			});
			const plan = (planPayload?.plan ?? planPayload) as {
				items?: { feature_id?: string; price?: { billing_method?: string } }[];
			};
			const prepaidItem = (plan?.items ?? []).find(
				(item) => item.price?.billing_method === "prepaid",
			);
			if (prepaidItem?.feature_id) {
				prepaidPlanId = candidate;
				prepaidFeatureId = prepaidItem.feature_id;
				break;
			}
		}
		if (!(prepaidPlanId && prepaidFeatureId)) {
			console.log("S9 skipped — no prepaid plan in sandbox fixtures");
		} else {
			const threadId = `e2e-${RUN_TAG}-s9`;
			const turn = await runTurn({
				installation,
				text: `In sandbox: attach the plan "${prepaidPlanId}" to customer "${customerId}" and put them on 4,500 ${prepaidFeatureId}.`,
				threadId,
			});
			const args = (turn.output.suspension?.toolArgs ?? {}) as {
				request?: {
					customize?: { add_items?: unknown[]; remove_items?: unknown[] };
					feature_quantities?: { feature_id?: string; quantity?: number }[];
				};
			};
			const quantities = args.request?.feature_quantities ?? [];
			const setCorrectly = quantities.some(
				(entry) =>
					entry.feature_id === prepaidFeatureId && entry.quantity === 4500,
			);
			const editedItemInstead = Boolean(
				args.request?.customize?.remove_items?.length ||
					args.request?.customize?.add_items?.length,
			);
			const askedInstead = Boolean(
				turn.output.question &&
					/quantit|prepaid|credit/i.test(turn.output.question.prompt),
			);
			check(
				"S9 bare amount handled as prepaid quantity (or clarified)",
				(setCorrectly && !editedItemInstead) || askedInstead,
				turn.output.suspension
					? `feature_quantities=${JSON.stringify(quantities)} customize=${JSON.stringify(args.request?.customize ?? null).slice(0, 120)}`
					: (turn.output.question?.prompt?.slice(0, 120) ??
							turn.output.text?.slice(0, 120)),
			);
			if (turn.output.suspension && turn.output.runId) {
				// Card safety net: the quantity (or its absence) must be visible.
				const target = makeTarget();
				await presentApproval({
					channelId: threadId,
					installation,
					loading: null,
					logAction: () => undefined,
					logger,
					orgId: installation.org_id,
					output: turn.output,
					providerUserId: USER_A,
					target: target as never,
				});
				const cardJson = JSON.stringify(target.posted.at(-1)?.content ?? {});
				check(
					"S9 card surfaces the prepaid quantity decision",
					cardJson.includes("prepaid"),
					cardJson.slice(0, 260),
				);
				// Nothing applies: withdraw the parked write.
				const approval = await pendingApprovalForRun({
					channelId: threadId,
					installation,
					runId: turn.output.runId,
				});
				if (approval) {
					await denyEveApproval({ approval, providerUserId: USER_A });
					await chatApprovalRepo.cancel({
						approvalId: approval.id,
						db,
						providerUserId: USER_A,
					});
				}
			}
		}
	}

	// ---- summary ----
	const failed = results.filter((result) => !result.ok);
	console.log(
		`\n=== ${results.length - failed.length}/${results.length} checks passed ===`,
	);
	if (failed.length > 0) {
		for (const failure of failed) {
			console.log(
				`FAILED: ${failure.name}${failure.detail ? ` — ${failure.detail}` : ""}`,
			);
		}
		process.exit(1);
	}
	process.exit(0);
};

main().catch((error) => {
	console.error("E2E crashed:", error);
	process.exit(1);
});
