import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AppEnv } from "@autumn/shared";
import { z } from "zod";
import { schemaByTool } from "../../../../packages/mcp/src/tools/index.js";
import { GATED_WRITES } from "../../../leaf/agent/lib/gatedWrites.js";
import {
	comparableToolRequest,
	type PreviewedRequest,
	unpreviewedWriteReason,
} from "../../../leaf/src/internal/approvals/utils/previewedRequest.js";
import { isSameToolRequest } from "../../../leaf/src/internal/approvals/utils/toolRequest.js";
import {
	type AutumnMcpToolMetadata,
	callAutumnMcpTool,
	listAutumnMcpTools,
} from "../../../leaf/src/internal/autumnMcp/rpcClient.js";
import { createAutumnApiMock } from "../../../leaf/tests/evals/harness/context/createAutumnApiMock.js";
import { createAutumnMcpServer } from "../../../leaf/tests/evals/harness/context/createAutumnMcpServer.js";
import { askJev } from "../../lib/jev.js";
import {
	assertBillingTermsPreserved,
	assertInvoiceTrialCompatible,
	changedRequestFields,
	nativeBillingConfirmationGuidance,
} from "./preservation.js";
import type { NativeCall, NativeContext, NativeMode } from "./protocol.js";
import { nativeInstructions, selectNativeContext } from "./routing.js";
import { createNativeSeed, NATIVE_SEED_PROVENANCE } from "./seed.js";

const supported = new Set([
	"getAgentRules",
	"listCustomers",
	"getCustomer",
	"listEntities",
	"getEntity",
	"listPlans",
	"getPlan",
	"listFeatures",
	"previewAttach",
	"attach",
	"previewUpdateSubscription",
	"updateSubscription",
	"previewCreateSchedule",
	"createSchedule",
	"updateCustomer",
	"getOrCreateCustomer",
	"createEntity",
	"listRewards",
	"createReward",
]);

const callSchema = z.object({
	sessionId: z.string().min(1),
	callId: z.string().min(1),
	name: z
		.string()
		.refine((name) => supported.has(name), "Unsupported native tool"),
	args: z.record(z.unknown()),
});

const unpack = (value: unknown): unknown => {
	const result = value as { content?: Array<{ type: string; text?: string }> };
	const text = result.content?.find((item) => item.type === "text")?.text;
	return text ? JSON.parse(text) : value;
};

type Proposal = { call: NativeCall; authorized: boolean; superseded: boolean };
type Session = {
	setup: ReturnType<typeof createNativeSeed>;
	messages: unknown;
	latestUserMessage?: { message: string; turnId: string };
	context?: NativeContext;
	previews: PreviewedRequest[];
	proposals: Map<string, Proposal>;
	results: Map<string, Promise<unknown>>;
	evidence: Array<{ call: NativeCall; result: unknown }>;
	rewards: Record<string, unknown>[];
	pendingRequests: Map<
		string,
		{ requestId: string; input: Record<string, unknown> }
	>;
};

export const startNativeBridge = async ({
	mode,
	reportDir,
	today = new Date().toISOString(),
}: {
	mode: NativeMode;
	reportDir: string;
	today?: string;
}) => {
	await mkdir(reportDir, { recursive: true });
	await writeFile(
		resolve(reportDir, "seed-provenance.json"),
		JSON.stringify(NATIVE_SEED_PROVENANCE, null, 2),
		{ mode: 0o600 },
	);
	const log = (event: unknown) =>
		appendFile(
			resolve(reportDir, "bridge.jsonl"),
			`${JSON.stringify(event)}\n`,
			{ mode: 0o600 },
		);
	const mcp = await createAutumnMcpServer({
		apiKey: "sk_native_fixture",
		env: "sandbox",
		principalId: "native-eval",
		resource: "http://localhost/native-eval",
		scopes: [
			"customers:read",
			"customers:write",
			"plans:read",
			"billing:read",
			"billing:write",
			"rewards:read",
			"rewards:write",
		],
		serverURL: "http://localhost:8080",
	});
	const rpcOptions = {
		baseUrl: mcp.url.origin,
		env: AppEnv.Sandbox,
		token: "sk_native_fixture",
	};
	let metadata: AutumnMcpToolMetadata[];
	try {
		metadata = (await listAutumnMcpTools(rpcOptions)).filter((tool) =>
			supported.has(tool.name),
		);
	} catch (error) {
		await mcp.close();
		throw error;
	}
	const sessions = new Map<string, Session>();
	const sessionFor = (id: string) => {
		let session = sessions.get(id);
		if (!session) {
			session = {
				setup: createNativeSeed(),
				messages: [],
				previews: [],
				proposals: new Map(),
				results: new Map(),
				evidence: [],
				rewards: [],
				pendingRequests: new Map(),
			};
			sessions.set(id, session);
		}
		return session;
	};
	let queue = Promise.resolve();
	const attachPreservation = (call: NativeCall, session: Session) => {
		const request = call.args.request as Record<string, unknown>;
		const previous = [...session.proposals.values()]
			.reverse()
			.find(
				(proposal) =>
					proposal.call.callId !== call.callId &&
					!proposal.authorized &&
					proposal.call.name === "attach" &&
					(proposal.call.args.request as Record<string, unknown>)
						.customer_id === request.customer_id &&
					(proposal.call.args.request as Record<string, unknown>).entity_id ===
						request.entity_id,
			);
		return {
			previousProposal: previous ? structuredClone(previous) : undefined,
			changedFields: previous
				? changedRequestFields(
						previous.call.args.request as Record<string, unknown>,
						request,
					)
				: [],
			latestUserMessage: session.latestUserMessage,
		};
	};
	const guardAttach = async (call: NativeCall, session: Session) => {
		if (!["attach", "previewAttach"].includes(call.name)) return;
		const request = call.args.request as Record<string, unknown>;
		const preservation = attachPreservation(call, session);
		await log({ type: "preservation_check", call, ...preservation });
		const customer = [...session.evidence]
			.reverse()
			.find(
				({ call: read, result }) =>
					read.name === "getCustomer" &&
					(read.args.request as Record<string, unknown>).customer_id ===
						request.customer_id &&
					(result as { id?: unknown }).id === request.customer_id,
			)?.result as { payment_method?: { id?: unknown } } | undefined;
		assertBillingTermsPreserved({
			previous: preservation.previousProposal?.call.args.request as
				| Record<string, unknown>
				| undefined,
			next: request,
			userMessage: session.latestUserMessage?.message,
			hasPaymentMethod:
				typeof customer?.payment_method?.id === "string" &&
				customer.payment_method.id.length > 0,
		});
		assertInvoiceTrialCompatible(request);
	};
	const callMock = (call: NativeCall, session: Session) => {
		const operation = queue.then(async () => {
			if (call.name === "attach")
				assertInvoiceTrialCompatible(
					call.args.request as Record<string, unknown>,
				);
			else await guardAttach(call, session);
			const mock = createAutumnApiMock({ setup: session.setup });
			const mockFetch = globalThis.fetch;
			globalThis.fetch = (async (input, init) => {
				const url = new URL(String(input));
				if (
					url.origin === mock.serverURL &&
					url.pathname.startsWith("/v1/rewards.")
				) {
					const body = JSON.parse(String(init?.body ?? "{}"));
					if (url.pathname === "/v1/rewards.list")
						return Response.json({ list: session.rewards });
					if (url.pathname === "/v1/rewards.create") {
						const reward = {
							...body,
							id: body.id ?? `native_reward_${session.rewards.length + 1}`,
						};
						session.rewards.push(reward);
						return Response.json(reward);
					}
					throw new Error("Unknown reward fixture endpoint");
				}
				return mockFetch(input, init);
			}) as typeof fetch;
			try {
				const { approval_description: _description, ...args } = call.args;
				const result = await callAutumnMcpTool({
					...rpcOptions,
					toolName: call.name,
					args: {
						intent: "Perform the requested native sandbox operation",
						...args,
					},
				});
				const value = unpack(result);
				session.evidence.push({
					call: structuredClone(call),
					result: structuredClone(value),
				});
				if (
					!(result as { isError?: boolean }).isError &&
					!(value as { error?: unknown })?.error
				) {
					if (GATED_WRITES.some((write) => write.previewTool === call.name)) {
						const request = comparableToolRequest(call.args);
						if (request)
							session.previews.push({
								previewTool: call.name,
								request: structuredClone(request),
							});
					}
				}
				await log({ type: "tool_result", call, result, apiCalls: mock.calls });
				return result;
			} finally {
				mock.restore();
			}
		});
		queue = operation.then(
			() => undefined,
			() => undefined,
		);
		return operation;
	};

	const validate = async (call: NativeCall, session: Session) => {
		const schema = schemaByTool[call.name as keyof typeof schemaByTool];
		if (!schema) throw new Error("Missing native request schema");
		schema.parse(call.args.request);
		const gate = GATED_WRITES.find((write) => write.toolName === call.name);
		if (!gate) throw new Error("Not an approval-gated native operation");
		if (
			typeof call.args.approval_description !== "string" ||
			!call.args.approval_description.trim()
		)
			throw new Error("A grounded approval_description is required");
		if (gate.previewedRequestRequired && gate.previewTool) {
			const reason = unpreviewedWriteReason({
				previewTool: gate.previewTool,
				previewed: session.previews,
				request: comparableToolRequest(call.args),
				toolName: call.name,
			});
			if (reason) throw new Error(reason);
		}
		const request = call.args.request as Record<string, unknown>;
		await guardAttach(call, session);
		for (const existing of session.proposals.values()) {
			if (
				existing.call.callId !== call.callId &&
				!existing.superseded &&
				!existing.authorized &&
				existing.call.name === call.name &&
				isSameToolRequest(
					existing.call.args.request as Record<string, unknown>,
					request,
				)
			)
				throw new Error(
					`This exact write already awaits approval as ${existing.call.callId}; retain that gate instead of issuing a duplicate`,
				);
		}
		if (typeof request.customer_id === "string") {
			const verified = session.evidence.some(
				({ call: read, result }) =>
					read.name === "getCustomer" &&
					(read.args.request as Record<string, unknown>)?.customer_id ===
						request.customer_id &&
					(result as { id?: unknown; error?: unknown })?.id ===
						request.customer_id &&
					!(result as { error?: unknown }).error,
			);
			if (!verified)
				throw new Error(
					"Read the target with getCustomer before proposing its write",
				);
		}
		if (mode === "jev") {
			const answers = await askJev({
				state: {
					messages: session.messages,
					evidence: session.evidence,
					proposal: call,
					...(call.name === "attach" ? attachPreservation(call, session) : {}),
				},
				questions: {
					wrong_target:
						"Does the proposed write contradict the user's requested customer, product, or entity?",
					wrong_terms:
						"Does the write contradict or omit explicit requested price, trial, entitlement, date, cancellation, or reward terms? Compare previousProposal and changedFields when present: unchanged prior invoice/access/price/target terms remain binding after SDK cancellation. A request to add a trial does not authorize changing collection mode or introducing a new payment-method requirement. Invoice-compatible card-required trials can be valid when the user explicitly accepts that requirement or authoritative customer evidence already satisfies it. Unspecified initial defaults are not omissions.",
					unauthorized_change:
						"Is the latest user turn only asking a question or requesting reversal of an already-applied billing change, rather than authorizing preparation of this new or refined proposal?",
				},
				onMeasurement: (measurement) => {
					void log({
						type: "jev_measurement",
						sessionId: call.sessionId,
						measurement,
					});
				},
			});
			await log({ type: "verification", call, answers });
			if (Object.values(answers).some((probability) => probability >= 0.7))
				throw new Error(
					`Proposal needs correction: ${JSON.stringify(answers)}`,
				);
		}
		for (const existing of session.proposals.values()) {
			const old = existing.call.args.request as Record<string, unknown>;
			if (
				existing.call.callId !== call.callId &&
				existing.call.name === call.name &&
				old.customer_id === request.customer_id &&
				old.plan_id === request.plan_id &&
				old.entity_id === request.entity_id &&
				!isSameToolRequest(old, request)
			)
				existing.superseded = true;
		}
		session.proposals.set(call.callId, {
			call: structuredClone(call),
			authorized: false,
			superseded: false,
		});
		await log({ type: "proposal_validated", call });
	};
	const requireProposal = (call: NativeCall, session: Session) => {
		const proposal = session.proposals.get(call.callId);
		if (
			!proposal ||
			proposal.superseded ||
			proposal.call.name !== call.name ||
			!isSameToolRequest(proposal.call.args, call.args)
		)
			throw new Error("Approval does not match an active immutable proposal");
		return proposal;
	};
	const token = crypto.randomUUID();
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			if (request.headers.get("authorization") !== `Bearer ${token}`)
				return new Response(null, { status: 401 });
			try {
				const path = new URL(request.url).pathname;
				const body = await request.json();
				if (path === "/user-message") {
					const input = z
						.object({
							sessionId: z.string(),
							message: z.string(),
							turnId: z.string(),
						})
						.parse(body);
					sessionFor(input.sessionId).latestUserMessage = {
						message: input.message,
						turnId: input.turnId,
					};
					await log({ type: "sdk_user_message", ...input });
					return Response.json({ recorded: true });
				}
				if (path === "/pending") {
					const input = z
						.object({
							sessionId: z.string(),
							requests: z.array(
								z.object({
									requestId: z.string(),
									kind: z.string(),
									action: z.object({
										callId: z.string(),
										input: z.record(z.unknown()),
									}),
								}),
							),
						})
						.parse(body);
					const session = sessionFor(input.sessionId);
					for (const pending of input.requests) {
						if (
							pending.kind === "tool-approval" &&
							session.proposals.has(pending.action.callId)
						)
							session.pendingRequests.set(pending.action.callId, {
								requestId: pending.requestId,
								input: pending.action.input,
							});
					}
					await log({ type: "sdk_pending", ...input });
					return Response.json({ recorded: true });
				}
				if (path === "/settled") {
					const input = z
						.object({
							sessionId: z.string(),
							resolutions: z.array(
								z.object({ requestId: z.string(), outcome: z.string() }),
							),
						})
						.parse(body);
					const session = sessionFor(input.sessionId);
					for (const resolution of input.resolutions) {
						for (const [callId, pending] of session.pendingRequests) {
							if (pending.requestId !== resolution.requestId) continue;
							session.pendingRequests.delete(callId);
							const proposal = session.proposals.get(callId);
							if (proposal && resolution.outcome !== "approved")
								proposal.superseded = true;
						}
					}
					await log({ type: "sdk_settled", ...input });
					return Response.json({ recorded: true });
				}
				if (path === "/supersede") {
					const input = z
						.object({
							sessionId: z.string(),
							call_id: z.string(),
							reason: z.string().min(1),
						})
						.parse(body);
					const session = sessionFor(input.sessionId);
					const pending = session.pendingRequests.get(input.call_id);
					const proposal = session.proposals.get(input.call_id);
					if (
						!pending ||
						!proposal ||
						proposal.authorized ||
						proposal.superseded
					)
						throw new Error(
							"Only an active unexecuted approval can be superseded",
						);
					await log({
						type: "supersession_requested",
						...input,
						requestId: pending.requestId,
					});
					return Response.json({ requestId: pending.requestId });
				}
				if (path === "/context") {
					const input = z
						.object({ sessionId: z.string().min(1), messages: z.unknown() })
						.parse(body);
					const session = sessionFor(input.sessionId);
					session.messages = input.messages;
					session.context = await selectNativeContext({
						mode: mode === "jev" ? "flash" : mode,
						messages: input.messages,
						tools: metadata,
						today,
						onMeasurement: (measurement) => {
							void log({
								type: "jev_measurement",
								sessionId: input.sessionId,
								measurement,
							});
						},
					});
					if (mode === "jev")
						session.context.content = `${nativeInstructions}\n\nCurrent date: ${today}`;
					await log({
						type: "context",
						sessionId: input.sessionId,
						messages: input.messages,
						context: session.context,
					});
					return Response.json(session.context);
				}
				if (path === "/tools") {
					const input = z
						.object({
							sessionId: z.string().min(1),
							messages: z.unknown().optional(),
						})
						.parse(body);
					const session = sessionFor(input.sessionId);
					if (input.messages !== undefined) session.messages = input.messages;
					const pendingContext = `\n\nCurrent genuine pending approvals: ${JSON.stringify([...session.pendingRequests].map(([callId, pending]) => ({ callId, request: pending.input.request })))}. Questions keep these unchanged. Resolve compatibility and authorization before canceling an old approval; then use supersede_approval before issuing its changed replacement. Never issue another unchanged pending write.\n\nRetained immutable unexecuted proposals (cancellation does not erase unchanged terms): ${JSON.stringify([...session.proposals.values()].filter((proposal) => !proposal.authorized).map((proposal) => ({ callId: proposal.call.callId, name: proposal.call.name, request: proposal.call.args.request, superseded: proposal.superseded })))}. ${nativeBillingConfirmationGuidance}`;
					const catalogDetailNote =
						" Required for a specific plan's tiers, overage rates or entitlements when the message's supplied context does not already contain them; listPlans is a summary listing and does not satisfy that lookup.";
					const described = metadata.map((tool) =>
						tool.name === "getPlan"
							? { ...tool, description: tool.description + catalogDetailNote }
							: tool,
					);
					if (mode !== "jev")
						return Response.json(
							described.map((tool, index) =>
								index === 0
									? { ...tool, description: tool.description + pendingContext }
									: tool,
							),
						);
					const selected = await selectNativeContext({
						mode,
						messages: session.messages,
						tools: described,
						today,
						onMeasurement: (measurement) => {
							void log({
								type: "jev_measurement",
								sessionId: input.sessionId,
								measurement,
							});
						},
					});
					await log({
						type: "step_selection",
						sessionId: input.sessionId,
						messages: session.messages,
						selected,
					});
					return Response.json(
						selected.tools.map((tool, index) =>
							index === 0
								? {
										...tool,
										description: `${tool.description}\n\nRelevant guidance for this request:\n${selected.content}${pendingContext}`,
									}
								: tool,
						),
					);
				}
				const call = callSchema.parse(body);
				const session = sessionFor(call.sessionId);
				if (path === "/validate") {
					await validate(call, session);
					return Response.json({ valid: true });
				}
				if (path === "/authorize") {
					requireProposal(call, session).authorized = true;
					await log({ type: "approval_authorized", call });
					return Response.json({ authorized: true });
				}
				if (path !== "/call") return new Response(null, { status: 404 });
				if (
					GATED_WRITES.some((gate) => gate.toolName === call.name) &&
					!requireProposal(call, session).authorized
				)
					throw new Error(
						"A real Eve approval response is required before mock execution",
					);
				let result = session.results.get(call.callId);
				if (!result) {
					result = callMock(call, session);
					session.results.set(call.callId, result);
				}
				return Response.json(await result);
			} catch (error) {
				await log({
					type: "bridge_error",
					path: new URL(request.url).pathname,
					error:
						error instanceof Error ? error.message : "Native bridge failed",
				});
				return Response.json(
					{
						error:
							error instanceof Error ? error.message : "Native bridge failed",
					},
					{ status: 422 },
				);
			}
		},
	});
	return {
		url: `http://127.0.0.1:${server.port}`,
		token,
		close: async () => {
			server.stop(true);
			await queue;
			await mcp.close();
		},
	};
};
