import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { AppEnv } from "@autumn/shared";
import { Client, type ClientSession, type MessageResponse } from "eve/client";
import { withApprovalDescriptionSchema } from "../../leaf/agent/lib/approvalDescriptionSchema.js";
import { GATED_WRITES } from "../../leaf/agent/lib/gatedWrites.js";
import {
	comparableToolRequest,
	type PreviewedRequest,
	unpreviewedWriteReason,
} from "../../leaf/src/internal/approvals/utils/previewedRequest.js";
import {
	callAutumnMcpTool,
	listAutumnMcpTools,
} from "../../leaf/src/internal/autumnMcp/rpcClient.js";
import type { EvalAgentDriver } from "../../leaf/tests/evals/harness/drivers/types.js";
import {
	prepareContext,
	type ToolCall,
	unpackToolResult,
	verifyProposal,
} from "./context.js";
import type { JevMeasurement } from "./jev.js";
import { messageContent } from "./messageContent.js";
import { createSingleExecution } from "./singleExecution.js";

const supported = new Set([
	"getAgentRules",
	"listCustomers",
	"getCustomer",
	"getOrCreateCustomer",
	"createEntity",
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
]);

export const createEveLabDriver = (): EvalAgentDriver => ({
	name: `eve-lab-${process.env.LEAF_LAB_MODE ?? "jev"}`,
	start: async ({ context, trace, name, today }) => {
		const mode = process.env.LEAF_LAB_MODE ?? "jev";
		const single = mode === "jev" && process.env.LEAF_LAB_EXECUTION !== "loop";
		if (!["jev", "flash", "opus"].includes(mode))
			throw new Error("Unknown Leaf lab mode");
		if (mode === "jev" && !process.env.TYPESAFE_API_KEY)
			throw new Error("TYPESAFE_API_KEY is required");
		const toolCalls: ToolCall[] = [];
		const measurements: Array<Record<string, unknown>> = [];
		const previews: PreviewedRequest[] = [];
		let pending: ToolCall[] = [];
		let evidence: unknown;
		let preparedMarkdown: string | undefined;
		const conversation: Array<{ role: string; content: string }> = [];
		let preparationError: unknown;
		let proposalAttempts = 0;
		let activeStart = 0;
		let firstPromptStart: number | undefined;
		let turnIndex = 0;
		let turnType = "user";
		const onMeasurement = (measurement: JevMeasurement) =>
			measurements.push({ kind: "jev", ...measurement });
		const rpc = (call: ToolCall) =>
			callAutumnMcpTool({
				args: call.args,
				toolName: call.name,
				baseUrl: context.mcpServer.url.origin,
				env: AppEnv.Sandbox,
				token: "sk_test",
			});
		const read = async (call: ToolCall) => {
			if (!supported.has(call.name))
				throw new Error(`Unsupported lab tool: ${call.name}`);
			toolCalls.push(call);
			trace.event({ call, type: "tool_call" });
			const started = performance.now();
			const result = await rpc(call);
			unpackToolResult(result);
			measurements.push({
				kind: "tool",
				name: call.name,
				durationMs: performance.now() - started,
				elapsedMs: performance.now() - activeStart,
			});
			return result;
		};
		const metadata = (
			await listAutumnMcpTools({
				baseUrl: context.mcpServer.url.origin,
				env: AppEnv.Sandbox,
				token: "sk_test",
			})
		)
			.filter((tool) => supported.has(tool.name))
			.map((tool) => ({
				...tool,
				inputSchema: GATED_WRITES.some((write) => write.toolName === tool.name)
					? withApprovalDescriptionSchema(tool.inputSchema)
					: tool.inputSchema,
			}));
		const token = crypto.randomUUID();
		const bridge = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			async fetch(request) {
				if (request.headers.get("authorization") !== `Bearer ${token}`)
					return new Response(null, { status: 401 });
				try {
					const body = (await request.json()) as {
						messages?: unknown;
						name: string;
						args: Record<string, unknown>;
					};
					const path = new URL(request.url).pathname;
					if (path === "/tools") return Response.json(single ? [] : metadata);
					if (path === "/prepare") {
						try {
							if (preparedMarkdown) return Response.json(preparedMarkdown);
							const prepared = await prepareContext({
								messages: conversation,
								mode,
								call: read,
								onMeasurement,
							});
							evidence = structuredClone(prepared.evidence);
							measurements.push({ kind: "prepared_context", evidence });
							return Response.json(prepared.markdown);
						} catch (error) {
							preparationError = error;
							throw error;
						}
					}
					if (path !== "/call" || !supported.has(body.name))
						return new Response(null, { status: 404 });
					if (single)
						throw new Error(
							"Structured proposal mode does not execute model tool calls",
						);
					if (toolCalls.length >= 40)
						throw new Error("Lab tool-call limit reached");
					const call = { name: body.name, args: body.args };
					const gated = GATED_WRITES.find(
						(write) => write.toolName === call.name,
					);
					if (gated) {
						proposalAttempts += 1;
						if (proposalAttempts > 3)
							throw new Error("Lab proposal repair limit reached");
						if (gated.previewedRequestRequired && gated.previewTool) {
							const reason = unpreviewedWriteReason({
								previewTool: gated.previewTool,
								previewed: previews,
								request: comparableToolRequest(call.args),
								toolName: call.name,
							});
							if (reason) throw new Error(reason);
						}
						if (mode === "jev")
							await verifyProposal({
								evidence,
								call,
								onMeasurement,
								onVerdict: (answers) =>
									measurements.push({
										kind: "verification",
										answers,
										proposal: call,
									}),
							});
						pending.push(call);
						measurements.push({
							kind: "approval_ready",
							elapsedMs: performance.now() - activeStart,
							fromFirstPromptMs: firstPromptStart === undefined ? undefined : performance.now() - firstPromptStart,
						});
						trace.event({ type: "approval_pending" });
						return Response.json(
							"Recorded for approval; no write has executed. The user must approve before execution. Do not issue this write again.",
						);
					}
					const result = await read(call);
					if (GATED_WRITES.some((write) => write.previewTool === call.name)) {
						const requestBody = comparableToolRequest(call.args);
						if (requestBody)
							previews.push({ previewTool: call.name, request: requestBody });
					}
					return Response.json(result);
				} catch (error) {
					return Response.json(
						{
							error:
								error instanceof Error ? error.message : "Lab bridge failed",
						},
						{ status: 422 },
					);
				}
			},
		});
		const portReservation = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: () => new Response(),
		});
		const port = portReservation.port;
		portReservation.stop(true);
		const dir = resolve(import.meta.dirname, "..");
		const reportDir =
			process.env.LEAF_LAB_REPORT_DIR ??
			resolve(homedir(), ".capy/work/leaf-lab");
		await mkdir(reportDir, { recursive: true });
		const runId = `${Date.now()}-${mode}`;
		const eventPath = resolve(reportDir, `${runId}-events.jsonl`);
		await writeFile(eventPath, "", { mode: 0o600 });
		const hostLog = Bun.file(resolve(reportDir, `${runId}-host.log`));
		const host = Bun.spawn(
			[
				"node",
				resolve(dir, "node_modules/eve/bin/eve.js"),
				"dev",
				"--no-ui",
				"--port",
				String(port),
			],
			{
				cwd: dir,
				env: {
					...process.env,
					NODE_ENV: "development",
					LEAF_LAB_BRIDGE_URL: `http://127.0.0.1:${bridge.port}`,
					LEAF_LAB_BRIDGE_TOKEN: token,
					LEAF_LAB_EXECUTION: single ? "single" : "loop",
					LEAF_LAB_REPORT_DIR: reportDir,
					LEAF_LAB_RUN_ID: runId,
					LEAF_LAB_MODEL:
						mode === "opus"
							? "anthropic/claude-opus-5"
							: "google/gemini-3.8-flash:nitro",
				},
				stdout: hostLog,
				stderr: hostLog,
			},
		);
		const client = new Client({ host: `http://127.0.0.1:${port}` });
		let session: ClientSession | undefined;
		const cleanup = async () => {
			host.kill();
			await host.exited;
			bridge.stop(true);
			await writeFile(
				resolve(reportDir, `${runId}.json`),
				JSON.stringify(
					{
						name,
						mode,
						execution: single ? "single" : "loop",
						proposalAttempts,
						measurements,
						trace: trace.entries(),
					},
					null,
					2,
				),
			);
		};
		try {
			const deadline = Date.now() + 90_000;
			while (true) {
				if (host.exitCode !== null)
					throw new Error(`Eve host exited; inspect ${runId}-host.log`);
				try {
					await client.health();
					break;
				} catch {
					if (Date.now() > deadline)
						throw new Error("Eve host did not become healthy");
					await Bun.sleep(500);
				}
			}
		} catch (error) {
			await cleanup();
			await context.cleanup();
			throw error;
		}
		const consume = async (response: MessageResponse) => {
			let text = "";
			let output: unknown;
			let steps = 0;
			for await (const event of response) {
				await appendFile(
					eventPath,
					`${JSON.stringify({ turnIndex, turnType, elapsedMs: performance.now() - activeStart, event })}\n`,
				);
				if (preparationError) throw preparationError;
				if (event.type === "step.started" && ++steps > (single ? 3 : 12))
					throw new Error("Lab model-step limit reached");
				if (event.type === "message.completed") text += event.data.message;
				if (event.type === "result.completed") output = event.data.result;
				if (event.type === "step.completed")
					measurements.push({
						kind: "model",
						...event.data,
						elapsedMs: performance.now() - activeStart,
					});
				if (event.type === "turn.failed" || event.type === "session.failed")
					throw new Error(JSON.stringify(event.data));
			}
			measurements.push({
				kind: "turn_completed",
				elapsedMs: performance.now() - activeStart,
			});
			if (preparationError) throw preparationError;
			if (!single && turnType === "user") measurements.push({ kind: "user_response_ready", turnIndex, turnType, elapsedMs: performance.now() - activeStart, fromFirstPromptMs: firstPromptStart === undefined ? undefined : performance.now() - firstPromptStart });
			trace.event({ type: "agent_text", text });
			conversation.push({ role: "assistant", content: text });
			return { text, output };
		};
		const singleExecutor = createSingleExecution({
			metadata,
			read,
			today,
			onMeasurement,
			setContext: (markdown) => {
				preparedMarkdown = markdown;
			},
			record: (measurement) => {
				measurements.push({ ...measurement, turnIndex, turnType, ...(measurement.kind === "approval_ready" && firstPromptStart !== undefined ? { fromFirstPromptMs: performance.now() - firstPromptStart } : {}) });
				if (measurement.kind === "approval_ready" && !measurement.retained)
					trace.event({ type: "approval_pending" });
			},
			generate: async ({ message, outputSchema }) => {
				proposalAttempts += 1;
				const options = { outputSchema, signal: AbortSignal.timeout(120_000) };
				const response = session
					? await session.send(message, options)
					: await client.sessions.create({ message, ...options });
				if ("session" in response) session = response.session;
				const generated = await consume(
					"response" in response ? response.response : response,
				);
				return generated.output;
			},
		});
		return {
			cleanup,
			getToolCalls: () => [...toolCalls],
			hasPendingApproval: () =>
				single ? singleExecutor.hasPendingApproval() : pending.length > 0,
			send: async (input) => {
				activeStart = performance.now();
				firstPromptStart ??= activeStart;
				const message = await messageContent({ message: input, reportDir });
				turnIndex += 1;
				turnType = "user";
				measurements.push({
					kind: "turn_started",
					turnIndex,
					turnType,
					message,
				});
				conversation.push({ role: "user", content: message });
				if (single) {
					const output = await singleExecutor.send(message, activeStart);
					trace.event({ type: "agent_text", text: output.text });
					measurements.push({ kind: "user_response_ready", turnIndex, turnType, elapsedMs: performance.now() - activeStart, fromFirstPromptMs: performance.now() - firstPromptStart });
					return output;
				}
				if (session)
					return consume(
						await session.send(message, {
							signal: AbortSignal.timeout(120_000),
						}),
					);
				const created = await client.sessions.create({
					message,
					signal: AbortSignal.timeout(120_000),
				});
				session = created.session;
				return consume(created.response);
			},
			approve: async () => {
				activeStart = performance.now();
				turnIndex += 1;
				turnType = "approve";
				measurements.push({ kind: "turn_started", turnIndex, turnType });
				if (single) {
					if (!singleExecutor.hasPendingApproval())
						throw new Error("No proposal to approve");
					trace.event({ type: "approval_approved" });
					const output = await singleExecutor.approve();
					trace.event({ type: "agent_text", text: output.text });
					return output;
				}
				if (!session || !pending.length)
					throw new Error("No proposal to approve");
				trace.event({ type: "approval_approved" });
				const approved = pending;
				pending = [];
				const results = [];
				for (const call of approved) {
					const gate = GATED_WRITES.find(
						(write) => write.toolName === call.name,
					);
					if (gate?.previewedRequestRequired && gate.previewTool) {
						const rejection = unpreviewedWriteReason({
							previewTool: gate.previewTool,
							previewed: previews,
							request: comparableToolRequest(call.args),
							toolName: call.name,
						});
						if (rejection) throw new Error(rejection);
					}
					const { approval_description: _description, ...args } = call.args;
					results.push({
						tool: call.name,
						result: unpackToolResult(await read({ name: call.name, args })),
					});
				}
				activeStart = performance.now();
				conversation.push({
					role: "user",
					content: `Approved. Completed tool results: ${JSON.stringify(results)}`,
				});
				return consume(
					await session.send(
						`The user approved the stored proposal and the executor completed it. These are the actual tool results: ${JSON.stringify(results)}. Summarize the outcome without issuing another write.`,
						{ signal: AbortSignal.timeout(120_000) },
					),
				);
			},
		};
	},
});
