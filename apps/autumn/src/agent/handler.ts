import Anthropic, { APIConnectionError, APIError, RateLimitError } from "@anthropic-ai/sdk";
import type { Message, Thread } from "chat";
import { Actions, Button, Card, LinkButton, CardText as Text } from "chat";
import { executeTool } from "@/agent/executor";
import { parseApiError } from "@/agent/shared";
import { getTools, MUTATING_TOOLS } from "@/agent/tools";
import { getEnv } from "@/config";
import { getWorkspaceIdFromRaw } from "@/lib/slack";
import { createAutumnClient } from "@/services/autumn";
import type { WorkspaceConfig } from "@/services/workspace";
import { getWorkspace } from "@/services/workspace";

const MAX_TOOL_ITERATIONS = 8;
const MAX_RECOVERY_DEPTH = 1;
const MAX_HISTORY = 20;

const MODEL = "claude-opus-4-6";

// Tracks threads with an active agent loop so we can notify them on shutdown.
// Without this, hot-reloads leave Slack showing "Typing..." with no response.
const activeThreads = new Set<Thread<unknown>>();

function handleShutdown() {
	if (activeThreads.size === 0) return;
	console.log(`shutdown: notifying ${activeThreads.size} active thread(s)`);
	const posts = [...activeThreads].map((thread) =>
		thread.post("Autumn restarted, please try again.").catch(() => {}),
	);
	activeThreads.clear();
	// Wait for posts to reach Slack before exiting, with a 3s hard timeout
	Promise.allSettled(posts).then(() => process.exit(0));
	setTimeout(() => process.exit(1), 3000);
}

process.on("SIGTERM", handleShutdown);
process.on("SIGINT", handleShutdown);

function buildSystemPrompt(workspace: WorkspaceConfig): string {
	return `You are Autumn, a billing ops assistant in Slack for Autumn (useautumn.com). You manage customers, subscriptions, usage, and billing through tools.

Connected to: ${workspace.orgName} (${workspace.orgSlug})

Rules:
- For mutating tools, write a short summary of what you'll do. Confirm/Cancel buttons appear automatically — never ask the user to confirm in text.
- For read tools, run them and present results directly.
- If a tool errors, explain clearly and suggest next steps.
- When the user asks to retry or try again, always re-call the relevant tools. Never rely on previous error messages in the conversation — the underlying issue may have been fixed.
- When a user refers to a customer by name or email (not an exact ID), use list_customers first, then use the exact customer ID from the response. Never guess customer IDs.
- When a user refers to a plan by name, use list_plans to find the correct plan ID first.
- When multiple customers match a name, list them with IDs and ask which one.
- If someone asks what you can do, give a brief 2-3 sentence overview, not a full list.

Formatting:
- This is Slack. Use *bold* for emphasis, backticks for IDs/values/emails, and • for bullet lists.
- No emojis. Be concise. No filler like "Sure!", "Great question!", "I'd be happy to help!".
- NEVER put app.useautumn.com URLs in your text. Slack mangles @ in URLs. Link buttons for View Customer, View Plan, etc. are added automatically below your response.
- For other links, use standard markdown: [label](url).

Skills — load guidance before responding:
- Before responding to any non-trivial message, call get_skill to load relevant guidance. Skip ONLY for trivial one-liners.
- Load "response_formatting" for any response that presents info, compares items, or walks through steps.
- Load "custom_plans" when creating, updating, or customizing plans/pricing.
- Load "billing_flows" when attaching plans, previewing costs, invoices, or checkout.
- Load "customer_ops" for customer lookups, balance ops, billing portal, or "can't do X" scenarios.
- You can load multiple skills in one call: get_skill(["customer_ops", "response_formatting"]).
- Skills are cached in conversation history — only load each skill once per thread.`;
}

let _anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
	if (!_anthropic) {
		const apiKey = getEnv().ANTHROPIC_API_KEY;
		if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
		_anthropic = new Anthropic({ apiKey });
	}
	return _anthropic;
}

function resolveWorkspaceId(raw: unknown): string | null {
	const workspaceId = getWorkspaceIdFromRaw(raw);
	if (!workspaceId) {
		const rawObj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
		console.warn(
			`workspace_resolve err=not_found keys=${Object.keys(rawObj).join(",") || "none"} team=${rawObj.team ?? "null"} team_id=${rawObj.team_id ?? "null"}`,
		);
	}
	return workspaceId;
}

async function handleIncomingAgentMessage(
	thread: Thread,
	message: Message,
	mode: "mention" | "subscribed",
): Promise<void> {
	if (thread.isDM) {
		if (mode === "mention") {
			await thread.post("DMs aren't supported yet, mention me in a channel instead.");
		}
		return;
	}

	const workspaceId = resolveWorkspaceId(message.raw);
	const workspace = workspaceId ? await getWorkspace(workspaceId) : null;

	if (mode === "mention") {
		await thread.subscribe();
	}

	if (!workspace) {
		if (mode === "mention") {
			console.warn(`workspace_lookup err=not_found id=${workspaceId} channel=${thread.channelId}`);
			await thread.post("Ask an admin to run `/connect` to set up Autumn for this workspace.");
		} else {
			await thread.post("Run `/connect` to set up Autumn first.");
		}
		return;
	}

	if (!workspace.apiKey) {
		await thread.post(
			mode === "mention"
				? "This workspace isn't connected to Autumn yet, run `/connect` to get started."
				: "Run `/connect` to set up Autumn first.",
		);
		return;
	}

	const channelBlocked =
		workspace.commandChannels.length > 0 &&
		thread.channelId &&
		!workspace.commandChannels.includes(thread.channelId);

	if (channelBlocked) {
		if (mode === "mention") {
			await thread.post(
				"Autumn isn't enabled in this channel, ask an admin to add it in settings.",
			);
		}
		return;
	}

	const text = message.text.length > 80 ? `${message.text.slice(0, 80)}...` : message.text;
	const rid = message.id;
	console.log(`agent rid=${rid} org=${workspace.orgSlug} msg="${text}"`);

	const messages = await buildMessages(thread, message);
	await runAgentLoopInner(thread, workspace, messages, 0, rid);
}

export async function handleAgentMention(thread: Thread, message: Message): Promise<void> {
	await handleIncomingAgentMessage(thread, message, "mention");
}

export async function handleAgentMessage(thread: Thread, message: Message): Promise<void> {
	await handleIncomingAgentMessage(thread, message, "subscribed");
}

async function buildMessages(thread: Thread, message: Message): Promise<Anthropic.MessageParam[]> {
	await thread.refresh();

	const history = thread.recentMessages
		.filter((msg) => msg.text.trim().length > 0)
		.sort((a, b) => a.metadata.dateSent.getTime() - b.metadata.dateSent.getTime())
		.slice(-MAX_HISTORY)
		.map((msg) => {
			if (msg.author.isMe) {
				return {
					role: "assistant" as const,
					content: `[Previous response — may be outdated, always re-check with tools]\n${msg.text}`,
				};
			}
			return {
				role: "user" as const,
				content: msg.text,
			};
		});

	if (history.length > 0) return history;
	return [{ role: "user", content: message.text }];
}

type PendingMutation = {
	toolName: string;
	toolInput: Record<string, unknown>;
};

export async function runAgentWithContext(
	thread: Thread<unknown>,
	raw: unknown,
	text: string,
	recoveryDepth = 0,
): Promise<void> {
	if (recoveryDepth > MAX_RECOVERY_DEPTH) {
		console.warn(`Recovery depth ${recoveryDepth} exceeded limit, stopping`);
		await thread.post(
			"Automatic recovery failed. Please try the operation again or adjust the parameters.",
		);
		return;
	}

	const workspaceId = resolveWorkspaceId(raw);
	if (!workspaceId) return;

	const workspace = await getWorkspace(workspaceId);
	if (!workspace?.apiKey) return;

	const rid = `recovery-${recoveryDepth}`;
	console.log(`agent rid=${rid} org=${workspace.orgSlug} msg="${text.slice(0, 80)}"`);
	await runAgentLoopInner(thread, workspace, [{ role: "user", content: text }], recoveryDepth, rid);
}

async function runAgentLoopInner(
	thread: Thread<unknown>,
	workspace: WorkspaceConfig,
	messages: Anthropic.MessageParam[],
	recoveryDepth = 0,
	rid = "recovery",
): Promise<void> {
	activeThreads.add(thread);
	try {
		const autumn = createAutumnClient(workspace);
		const anthropic = getAnthropic();

		await thread.startTyping().catch(() => {});

		let pendingMutation: PendingMutation | null = null;
		let iterations = 0;
		let lastCustomerId: string | null = null;
		let lastPlanId: string | null = null;
		const loadedSkills = new Set<string>();
		const systemPrompt = buildSystemPrompt(workspace);

		const logLLM = (r: Anthropic.Message, ms: number) => {
			const tools = r.content
				.filter((b) => b.type === "tool_use")
				.map((b) => (b as Anthropic.ToolUseBlock).name);
			console.log(
				`llm rid=${rid} stop=${r.stop_reason} in=${r.usage.input_tokens} out=${r.usage.output_tokens} ms=${ms}${tools.length ? ` tools=${tools.join(",")}` : ""}`,
			);
		};

		let response: Anthropic.Message;

		while (true) {
			const t0 = Date.now();
			response = await anthropic.messages.create({
				model: MODEL,
				max_tokens: 4096,
				system: systemPrompt,
				tools: getTools(loadedSkills),
				messages,
			});
			logLLM(response, Date.now() - t0);

			if (response.stop_reason !== "tool_use") break;

			iterations++;
			if (iterations > MAX_TOOL_ITERATIONS) {
				console.warn(`agent rid=${rid} err=tool_loop_exceeded iterations=${iterations}`);
				await thread.post(
					"This request required too many steps. Try breaking it into smaller questions.",
				);
				return;
			}

			const toolUseBlocks = response.content.filter(
				(b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
			);

			let mutatingBlock: Anthropic.ToolUseBlock | null = null;
			const skippedMutatingIds = new Set<string>();
			const readBlocks: Anthropic.ToolUseBlock[] = [];

			for (const toolUse of toolUseBlocks) {
				if (MUTATING_TOOLS.has(toolUse.name)) {
					if (!mutatingBlock) {
						mutatingBlock = toolUse;
					} else {
						skippedMutatingIds.add(toolUse.id);
					}
				} else {
					readBlocks.push(toolUse);
				}
				const input = toolUse.input as Record<string, unknown>;
				if (typeof input.customer_id === "string" && !toolUse.name.startsWith("list_"))
					lastCustomerId = input.customer_id;
				if (typeof input.plan_id === "string" && !toolUse.name.startsWith("list_"))
					lastPlanId = input.plan_id;
				if (toolUse.name === "get_skill") {
					for (const id of (input.skill_ids as string[]) || []) loadedSkills.add(id);
				}
			}

			const readResultsById = new Map(
				await Promise.all(
					readBlocks.map(async (toolUse) => {
						const params = toolUse.input as Record<string, unknown>;
						const paramStr = Object.entries(params)
							.map(([k, v]) => `${k}=${v}`)
							.join(" ");
						const toolStart = Date.now();
						const result = await executeTool(toolUse.name, params, autumn);
						const toolMs = Date.now() - toolStart;
						if (result.success) {
							console.log(`tool rid=${rid} ${toolUse.name} ok ms=${toolMs} ${paramStr}`);
						} else {
							console.warn(
								`tool rid=${rid} ${toolUse.name} err="${result.error}" ms=${toolMs} ${paramStr}`,
							);
						}
						const toolResult = {
							type: "tool_result" as const,
							tool_use_id: toolUse.id,
							content: JSON.stringify(result),
						};
						return [toolUse.id, toolResult] as const;
					}),
				),
			);

			const toolResults: Anthropic.ToolResultBlockParam[] = [];
			for (const toolUse of toolUseBlocks) {
				if (mutatingBlock && toolUse.id === mutatingBlock.id) {
					const params = toolUse.input as Record<string, unknown>;
					const paramStr = Object.entries(params)
						.map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
						.join(" ");
					console.log(`mutation rid=${rid} ${toolUse.name} ${paramStr}`);
					pendingMutation = {
						toolName: toolUse.name,
						toolInput: toolUse.input as Record<string, unknown>,
					};
					toolResults.push({
						type: "tool_result",
						tool_use_id: toolUse.id,
						content: JSON.stringify({
							status: "confirmation_required",
							message:
								"This is a mutating action. Describe what you're about to do clearly and concisely. Confirm/Cancel buttons will appear automatically after your message.",
							tool_name: toolUse.name,
							params: toolUse.input,
						}),
					});
					continue;
				}

				if (skippedMutatingIds.has(toolUse.id)) {
					console.warn(
						`mutation rid=${rid} skipped_extra tool=${toolUse.name} reason=multiple_mutations_in_single_turn`,
					);
					toolResults.push({
						type: "tool_result",
						tool_use_id: toolUse.id,
						content: JSON.stringify({
							status: "mutation_deferred",
							message:
								"Only one mutating action can be confirmed at a time. Continue with the first mutation and call additional mutating tools after confirmation.",
							tool_name: toolUse.name,
							params: toolUse.input,
						}),
					});
					continue;
				}

				const readResult = readResultsById.get(toolUse.id);
				if (readResult) toolResults.push(readResult);
			}

			messages.push({ role: "assistant", content: response.content });
			messages.push({ role: "user", content: toolResults });
		}

		const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
		const responseText = textBlocks.map((b) => b.text).join("\n");

		if (responseText && pendingMutation) {
			const actionPayload = {
				action: pendingMutation.toolName,
				...pendingMutation.toolInput,
				_recoveryDepth: recoveryDepth,
			};
			const actionValue = JSON.stringify(actionPayload);
			const isAttachPlan = pendingMutation.toolName === "attach_plan";
			const isPlanSwitch =
				isAttachPlan && !!(pendingMutation.toolInput as Record<string, unknown>).is_plan_switch;
			const buttons: ReturnType<typeof Button>[] = [
				Button({
					id: "confirm",
					label: isAttachPlan ? (isPlanSwitch ? "Confirm Charge" : "Checkout Link") : "Confirm",
					style: "primary",
					value: actionValue,
				}),
			];

			if (isAttachPlan) {
				buttons.push(
					Button({
						id: "confirm_invoice",
						label: "Draft Invoice",
						value: JSON.stringify({
							...actionPayload,
							invoice_mode: { enabled: true, finalize: false },
						}),
					}),
				);
			}

			buttons.push(
				Button({
					id: "cancel",
					label: "Cancel",
					style: "danger",
					value: actionValue,
				}),
			);

			await thread.post(
				Card({
					children: [Text(responseText), Actions(buttons)],
				}),
			);
		} else if (responseText) {
			const linkButtons: ReturnType<typeof LinkButton>[] = [];
			if (lastCustomerId) {
				linkButtons.push(
					LinkButton({
						label: "View All Customers",
						url: "https://app.useautumn.com/customers",
					}),
				);
			}
			if (lastPlanId) {
				linkButtons.push(
					LinkButton({
						label: "View Plan",
						url: `https://app.useautumn.com/products/${encodeURIComponent(lastPlanId)}`,
					}),
				);
			}

			if (linkButtons.length > 0) {
				await thread.post(Card({ children: [Text(responseText), Actions(linkButtons)] }));
			} else {
				await thread.post({ markdown: responseText });
			}
		} else {
			console.warn(`agent rid=${rid} empty_response out=${response.usage.output_tokens}`);
			await thread.post("Something went wrong, try rephrasing or starting a new thread.");
		}
	} catch (err) {
		if (err instanceof RateLimitError) {
			await thread.post("I'm being rate limited, try again in a moment.");
		} else if (err instanceof APIConnectionError) {
			await thread.post("I couldn't reach the AI service, try again in a moment.");
		} else if (err instanceof APIError && err.status >= 500) {
			await thread.post("The AI service is temporarily unavailable, try again later.");
		} else {
			const message = parseApiError(err);
			console.error(`agent rid=${rid} err="${message}"`);
			await thread.post("Something went wrong, try again later.");
		}
	} finally {
		activeThreads.delete(thread);
	}
}
