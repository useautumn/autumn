import { AppEnv, ms } from "@autumn/shared";
import { executeAutumnMcpTool } from "../../src/internal/autumnMcp/client.js";
import { getInstallationOAuthAccessToken } from "../../src/internal/installations/actions/getInstallationOAuthAccessToken.js";
import { logger } from "../../src/lib/logger.js";
import { runSlackAgentTurn } from "../../src/providers/slack/actions/runSlackAgentTurn.js";
import { createEveSlackPresenter } from "../../src/providers/slack/evePresenter.js";
import { findInstallationWithOrg } from "../../src/providers/slack/installations.js";
import { createStatusTicker } from "../../src/ui/statusTicker.js";

const WORKSPACE_ID = process.env.E2E_SLACK_WORKSPACE ?? "T07NPTDCU69";

const installation = await findInstallationWithOrg("slack", WORKSPACE_ID);
if (!installation) throw new Error("no installation");
const providerUserId = installation.installed_by_provider_user_id ?? "";
const token = await getInstallationOAuthAccessToken({
	env: AppEnv.Sandbox,
	installation,
	orgId: installation.org_id,
});

const runTag = Date.now().toString(36);
const customerId = process.env.E2E_CUSTOMER ?? `bench-${runTag}`;
const created = (await executeAutumnMcpTool({
	args: {
		request: {
			create_in_stripe: true,
			customer_id: customerId,
			email: `${customerId}@example.com`,
			name: customerId,
			with_autumn_id: false,
		},
	},
	env: AppEnv.Sandbox,
	token,
	toolName: "getOrCreateCustomer",
})) as { content?: Array<{ text?: string }> };
const createdBody = created.content?.[0]?.text ?? "";
if (
	/"error"\s*:\s*true/.test(createdBody) ||
	!createdBody.includes(customerId)
) {
	throw new Error(`customer setup failed: ${createdBody.slice(0, 200)}`);
}

const threadId = `bench-${runTag}`;
const target = {
	post: async (content: unknown) => {
		const postable = content as {
			getPostData?: () => { stream: AsyncIterable<unknown> };
			kind?: string;
		};
		if (postable?.kind === "stream" && postable.getPostData) {
			for await (const _ of postable.getPostData().stream) {
			}
		}
		return { id: "msg-1" };
	},
	startTyping: async () => {},
};
const ticker = createStatusTicker(target);
const presenter = createEveSlackPresenter({ setStatus: ticker.activity });
const startedAt = Date.now();
const output = await runSlackAgentTurn({
	channelId: threadId,
	installation,
	logger,
	onAction: (message) => presenter.onAction(message),
	onReasoning: presenter.onReasoning,
	onThinking: ticker.thinking,
	providerUserId,
	text: `attach the launch plan to ${customerId}`,
	threadId,
});
ticker.stop();
const wallMs = Date.now() - startedAt;
console.log(`TURN kind=${output.kind} wall=${(wallMs / 1000).toFixed(1)}s`);

const sessionId = (output as { sessionId?: string }).sessionId;
if (!sessionId) process.exit(1);

type TimedEvent = {
	at: number;
	callId?: string;
	detail: string;
	type: string;
};

const EVE_URL = process.env.EVE_SERVER_URL ?? "http://127.0.0.1:3999";
const STREAM_TOTAL_TIMEOUT_MS = ms.seconds(15);
const STREAM_IDLE_TIMEOUT_MS = ms.seconds(6);

const collectEvents = async (streamSessionId: string) => {
	const events: TimedEvent[] = [];
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), STREAM_TOTAL_TIMEOUT_MS);
	try {
		const response = await fetch(
			`${EVE_URL}/eve/v1/session/${streamSessionId}/stream`,
			{ signal: controller.signal },
		);
		const reader = response.body?.getReader();
		if (!reader) return events;
		const decoder = new TextDecoder();
		let buffered = "";
		let sawTerminal = false;
		let idleTimer: ReturnType<typeof setTimeout> | undefined;
		const resetIdle = () => {
			if (idleTimer) clearTimeout(idleTimer);
			idleTimer = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);
		};
		resetIdle();
		while (!sawTerminal) {
			const { done, value } = await reader.read();
			if (done) break;
			resetIdle();
			buffered += decoder.decode(value, { stream: true });
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim()) continue;
				let event: Record<string, unknown>;
				try {
					event = JSON.parse(line);
				} catch {
					continue;
				}
				const type = String(event.type ?? "");
				const data = (event.data ?? {}) as Record<string, unknown> & {
					actions?: Array<{ callId?: string; toolName?: string }>;
					childSessionId?: string;
					message?: string;
					name?: string;
					requests?: Array<{ action?: { toolName?: string } }>;
					result?: { callId?: string; toolName?: string };
				};
				const at = Date.parse(
					String((event.meta as { at?: string })?.at ?? ""),
				);
				if (type === "actions.requested") {
					for (const action of data.actions ?? []) {
						events.push({
							at,
							callId: action.callId,
							detail: action.toolName ?? "?",
							type: "call",
						});
					}
				} else if (type === "action.result") {
					events.push({
						at,
						callId: data.result?.callId,
						detail: data.result?.toolName ?? "?",
						type: "result",
					});
				} else if (type === "subagent.called") {
					events.push({
						at,
						detail: `${data.name} -> ${data.childSessionId}`,
						type: "subagent.called",
					});
				} else if (type === "input.requested") {
					events.push({
						at,
						detail: (data.requests ?? [])
							.map((request) => request.action?.toolName)
							.join(","),
						type: "park",
					});
				} else if (
					["turn.started", "session.started", "turn.completed"].includes(type)
				) {
					events.push({ at, detail: "", type });
				} else if (type === "message.completed") {
					events.push({
						at,
						detail: JSON.stringify(data.message ?? "").slice(0, 160),
						type: "message.completed",
					});
				}
				if (["session.completed", "session.failed"].includes(type)) {
					sawTerminal = true;
				}
			}
		}
		if (idleTimer) clearTimeout(idleTimer);
	} catch (error) {
		if (!controller.signal.aborted) {
			console.log(`STREAM ERROR ${streamSessionId}:`, error);
		}
	} finally {
		clearTimeout(timeout);
	}
	return events;
};

const report = (label: string, events: TimedEvent[]) => {
	if (!events.length) return;
	const t0 = events[0].at;
	console.log(`\n===== ${label} =====`);
	const pendingCalls = new Map<string, { at: number; detail: string }>();
	for (const event of events) {
		const offset = ((event.at - t0) / 1000).toFixed(1).padStart(6);
		if (event.type === "call" && event.callId) {
			pendingCalls.set(event.callId, { at: event.at, detail: event.detail });
			console.log(`${offset}s  call    ${event.detail}`);
		} else if (event.type === "result" && event.callId) {
			const started = pendingCalls.get(event.callId);
			const duration = started
				? ` (${((event.at - started.at) / 1000).toFixed(1)}s)`
				: "";
			console.log(`${offset}s  result  ${event.detail}${duration}`);
		} else {
			console.log(`${offset}s  ${event.type}  ${event.detail}`);
		}
	}
};

const parentEvents = await collectEvents(sessionId);
if (parentEvents.length) {
	console.log(
		`PRE-TURN leaf setup: ${((parentEvents[0].at - startedAt) / 1000).toFixed(1)}s (bench start -> eve session.started)`,
	);
	const lastAt = parentEvents[parentEvents.length - 1].at;
	console.log(
		`POST-TURN leaf consume: ${((startedAt + wallMs - lastAt) / 1000).toFixed(1)}s (last parent event -> turn returned)`,
	);
}
report(`PARENT ${sessionId}`, parentEvents);
for (const event of parentEvents) {
	if (event.type === "subagent.called") {
		const childSessionId = event.detail.split(" -> ")[1];
		if (childSessionId) {
			report(`CHILD ${childSessionId}`, await collectEvents(childSessionId));
		}
	}
}
process.exit(0);
