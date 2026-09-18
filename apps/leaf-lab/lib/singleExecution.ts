import { GATED_WRITES } from "../../leaf/agent/lib/gatedWrites.js";
import {
	comparableToolRequest,
	unpreviewedWriteReason,
} from "../../leaf/src/internal/approvals/utils/previewedRequest.js";
import type {
	AutumnMcpToolMetadata,
	JsonSchemaObject,
} from "../../leaf/src/internal/autumnMcp/rpcClient.js";
import { type CallTool, type ToolCall, unpackToolResult } from "./context.js";
import { prepareDynamicContext } from "./dynamicContext.js";
import type { JevMeasurement } from "./jev.js";
import {
	buildProposalSchema,
	parseOperationPlan,
	renderOperation,
	validateOperationPreview,
} from "./operationPlan.js";
import { resolveRequestIdentities } from "./requestIdentities.js";
import { normalizeScheduleTiming } from "./scheduleTiming.js";
import { assertPlanRules, verifyOperationPlan } from "./verifyOperationPlan.js";

const provisioning = new Set(["getOrCreateCustomer", "createEntity"]);

export const createSingleExecution = ({
	metadata,
	read,
	generate,
	setContext,
	record,
	onMeasurement,
	today,
	prepare = prepareDynamicContext,
	verify = verifyOperationPlan,
}: {
	metadata: AutumnMcpToolMetadata[];
	read: CallTool;
	generate: (input: {
		message: string;
		outputSchema: JsonSchemaObject;
	}) => Promise<unknown>;
	setContext: (markdown: string) => void;
	record: (measurement: Record<string, unknown>) => void;
	onMeasurement: (measurement: JevMeasurement) => void;
	today?: Date;
	prepare?: typeof prepareDynamicContext;
	verify?: typeof verifyOperationPlan;
}) => {
	const messages: Array<{ role: string; content: string }> = [];
	const completed: Array<{ call: ToolCall; result: unknown }> = [];
	const disclosedObligations: Array<{
		obligation: string;
		reason: string;
		messageIndex: number;
	}> = [];
	let queue: ToolCall[] = [];
	let prepared: Awaited<ReturnType<typeof prepareDynamicContext>>;
	let pending:
		| {
				call: ToolCall;
				summary: string;
				previewTool?: string;
				previewRequest?: Record<string, unknown>;
				preview?: unknown;
		  }
		| undefined;
	let activeStart = 0;
	const refresh = async () => {
		prepared = await prepare({
			messages,
			call: read,
			pending: queue,
			completed,
			today,
			onMeasurement,
		});
		setContext(prepared.markdown);
		record({
			kind: "prepared_context",
			evidence: structuredClone(prepared.evidence),
		});
		record({ kind: "selection", answers: prepared.selection });
	};
	const verifyRemaining = () =>
		verify({
			evidence: { ...prepared.evidence, disclosedObligations },
			actions: queue,
			onMeasurement,
			onVerdict: (answers) =>
				record({
					kind: "verification",
					answers,
					actions: structuredClone(queue),
				}),
		});
	const execute = async (call: ToolCall) => {
		const result = unpackToolResult(await read(call));
		completed.push({ call: structuredClone(call), result });
		record({ kind: "execution_completed", call, result });
		if (
			result &&
			typeof result === "object" &&
			"required_action" in result &&
			result.required_action
		)
			throw new Error(
				`Execution requires user action; no further writes will run: ${JSON.stringify(result)}`,
			);
		return result;
	};
	const activateNext = async () => {
		assertPlanRules({ evidence: prepared.evidence, actions: queue });
		if (queue[0] && provisioning.has(queue[0].name)) {
			await verifyRemaining();
			while (queue[0] && provisioning.has(queue[0].name)) {
				const call = queue[0];
				if (call.name === "createEntity") {
					const request = call.args.request as Record<string, unknown>;
					unpackToolResult(
						await read({
							name: "listEntities",
							args: {
								request: { customer_id: request.customer_id },
								intent:
									"Check whether the explicitly requested entity already exists",
							},
						}),
					);
				}
				await execute(call);
				queue.shift();
			}
			await refresh();
		}
		const call = queue[0];
		if (!call)
			return "All requested operations have returned results; no billing approval is pending.";
		const gate = GATED_WRITES.find((entry) => entry.toolName === call.name);
		if (!gate) throw new Error(`No approval policy for ${call.name}`);
		const [preview] = await Promise.all([
			gate.previewTool
				? read({ name: gate.previewTool, args: call.args }).then((result) =>
						validateOperationPreview({
							call,
							preview: unpackToolResult(result),
						}),
					)
				: Promise.resolve(undefined),
			verifyRemaining(),
		]);
		const summary = renderOperation({
			call,
			preview,
			evidence: prepared.evidence,
		});
		pending = {
			call: structuredClone(call),
			summary,
			preview,
			previewTool: gate.previewTool,
			previewRequest: structuredClone(comparableToolRequest(call.args)),
		};
		record({
			kind: "approval_ready",
			elapsedMs: performance.now() - activeStart,
			proposal: call,
			preview,
			remainingOperations: queue.length,
		});
		return summary;
	};
	return {
		hasPendingApproval: () => pending !== undefined,
		pendingProposal: () =>
			pending
				? {
						call: structuredClone(pending.call),
						summary: pending.summary,
						preview: structuredClone(pending.preview),
					}
				: undefined,
		/** The host rejected or failed the pending call; forget it and any
		 * queued follow-ups so nothing stale can be approved later. */
		discardPending: () => {
			pending = undefined;
			queue = [];
		},
		/** The host executed the pending call itself (e.g. Leaf's approval
		 * card); record the result and advance to the next queued operation. */
		acknowledgeExecuted: async (result: unknown) => {
			activeStart = performance.now();
			if (!pending) throw new Error("No proposal to acknowledge");
			const approved = pending;
			pending = undefined;
			completed.push({ call: structuredClone(approved.call), result });
			record({ kind: "execution_completed", call: approved.call, result });
			queue.shift();
			const receipt = `Approved ${approved.call.name} request returned:\n${JSON.stringify(result)}`;
			messages.push({ role: "assistant", content: receipt });
			if (!queue.length) return { text: receipt };
			await refresh();
			const text = `${receipt}\n\nNext operation (requires its own approval):\n${await activateNext()}`;
			messages.push({ role: "assistant", content: text });
			return { text };
		},
		send: async (message: string, started = performance.now()) => {
			activeStart = started;
			messages.push({ role: "user", content: message });
			await refresh();
			if (
				pending &&
				(prepared.selection.pending_confirmation ?? 0) >= 0.7 &&
				(prepared.selection.pending_change ?? 0) < 0.7
			) {
				const text = `${pending.summary}\nThe stored request is unchanged; explicit approval is still required before execution.`;
				record({
					kind: "approval_ready",
					retained: true,
					elapsedMs: performance.now() - activeStart,
					proposal: pending.call,
				});
				messages.push({ role: "assistant", content: text });
				return { text };
			}
			const questionAboutPending =
				pending &&
				(prepared.selection.pending_question ?? 0) >= 0.7 &&
				(prepared.selection.pending_change ?? 0) < 0.7;
			if (pending && (prepared.selection.pending_change ?? 0) >= 0.7) {
				pending = undefined;
				queue = [];
				record({
					kind: "approval_withdrawn",
					reason: "User requested changing the stored proposal",
				});
			}
			const clarificationRequired = [
				"needs_scope_clarification",
				"needs_price_clarification",
				"needs_identity_clarification",
			].some((flag) => (prepared.selection[flag] ?? 0) >= 0.5);
			const operations =
				questionAboutPending || clarificationRequired
					? []
					: prepared.operations;
			const outputSchema = buildProposalSchema({ operations, metadata });
			if (questionAboutPending)
				setContext(
					`${prepared.markdown}\nExecutor turn policy: answer the user's question about the existing pending request. Return status answer, put the answer in message, and return actions: []. The executor retains the original approval request; do not reconstruct or resubmit its actions.`,
				);
			else if (clarificationRequired)
				setContext(
					`${prepared.markdown}\nExecutor turn policy: required facts are missing. Return status clarify with the specific missing questions in message and actions: []. No preview or mutation is permitted until those questions are resolved.`,
				);
			let prompt = message;
			for (let attempt = 0; attempt < 2; attempt++) {
				record({ kind: "proposal_attempt", attempt });
				const output = await generate({ message: prompt, outputSchema });
				record({ kind: "structured_output", output });
				try {
					const plan = parseOperationPlan({
						output,
						allowedOperations: operations,
						booleanFeatureIds: new Set(
							(
								(
									prepared.evidence.facts.listFeatures as
										| { list?: Array<{ id?: unknown; type?: unknown }> }
										| undefined
								)?.list ?? []
							).flatMap((feature) =>
								feature.type === "boolean" && typeof feature.id === "string"
									? [feature.id]
									: [],
							),
						),
					});
					if (plan.status !== "proposal") {
						if (!plan.message.trim())
							throw new Error(
								"Answers and clarifications require explanatory text",
							);
						messages.push({ role: "assistant", content: plan.message });
						for (const item of plan.unsupportedObligations)
							disclosedObligations.push({
								...item,
								messageIndex: messages.length - 1,
							});
						if (plan.unsupportedObligations.length)
							record({
								kind: "unsupported_obligations_disclosed",
								obligations: plan.unsupportedObligations,
							});
						if (pending)
							record({
								kind: "approval_ready",
								retained: true,
								elapsedMs: performance.now() - activeStart,
								proposal: pending.call,
							});
						return { text: plan.message };
					}
					if (plan.unsupportedObligations.length)
						throw new Error(
							`A proposal cannot silently carry unsupported obligations: ${plan.unsupportedObligations.map((item) => item.obligation).join("; ")}. Return status clarify explaining the unsupported obligation and required manual follow-up first; propose only after the user chooses to proceed.`,
						);
					plan.actions = normalizeScheduleTiming({
						actions: resolveRequestIdentities({
							actions: plan.actions,
							evidence: prepared.evidence,
						}),
						today: prepared.evidence.today,
						userDateEpochsMs: prepared.evidence.dateAnchors.map(
							(anchor) => anchor.utcMidnightEpochMs,
						),
					});
					if (
						pending &&
						queue.length === plan.actions.length &&
						queue.every(
							(call, index) =>
								call.name === plan.actions[index].name &&
								JSON.stringify(comparableToolRequest(call.args)) ===
									JSON.stringify(
										comparableToolRequest(plan.actions[index].args),
									),
						)
					) {
						record({
							kind: "approval_ready",
							retained: true,
							elapsedMs: performance.now() - activeStart,
							proposal: pending.call,
						});
						messages.push({ role: "assistant", content: pending.summary });
						return { text: pending.summary };
					}
					for (const call of plan.actions)
						if (
							completed.some(
								(entry) =>
									entry.call.name === call.name &&
									JSON.stringify(comparableToolRequest(entry.call.args)) ===
										JSON.stringify(comparableToolRequest(call.args)),
							)
						)
							throw new Error(
								"Plan repeats an already executed operation; propose only remaining work",
							);
					pending = undefined;
					queue = plan.actions;
					record({ kind: "resolved_plan", actions: structuredClone(queue) });
					const text = await activateNext();
					messages.push({ role: "assistant", content: text });
					return { text };
				} catch (error) {
					if (!questionAboutPending) {
						pending = undefined;
						queue = [];
					}
					record({ kind: "repair", attempt, error: String(error) });
					if (attempt === 1) throw error;
					await refresh();
					prompt = `Correct the prior structured response. Validation failed: ${String(error)}. Honor the unchanged original user request and all completed results in context. Do not repeat executed operations. Return the corrected remaining plan or a genuine clarification, using the output schema.`;
				}
			}
			throw new Error("Proposal repair budget exhausted");
		},
		approve: async () => {
			activeStart = performance.now();
			if (!pending) throw new Error("No proposal to approve");
			const approved = pending;
			if (approved.previewTool) {
				const reason = unpreviewedWriteReason({
					previewTool: approved.previewTool,
					previewed: [
						{
							previewTool: approved.previewTool,
							request: approved.previewRequest ?? {},
						},
					],
					request: comparableToolRequest(approved.call.args),
					toolName: approved.call.name,
				});
				if (reason) throw new Error(reason);
			}
			pending = undefined;
			const result = await execute(approved.call);
			queue.shift();
			const receipt = `Approved ${approved.call.name} request returned:\n${JSON.stringify(result)}`;
			messages.push({ role: "assistant", content: receipt });
			if (!queue.length) return { text: receipt };
			await refresh();
			const text = `${receipt}\n\nNext operation (requires its own approval):\n${await activateNext()}`;
			messages.push({ role: "assistant", content: text });
			return { text };
		},
	};
};
