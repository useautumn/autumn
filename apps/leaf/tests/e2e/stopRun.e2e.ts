/**
 * Stop must land immediately: mid-delegation the parent stream is silent, so
 * "stop" has to abort the local stream, return kind "stopped" fast, and leave
 * the typing status cleared — not cycling "Reasoning…".
 *
 *   bun tests/e2e/stopRun.e2e.ts
 */
import {
	registerRun,
	runKeyForThread,
} from "../../src/internal/runs/runRegistry.js";
import { logger } from "../../src/lib/logger.js";
import { runSlackAgentTurn } from "../../src/providers/slack/actions/runSlackAgentTurn.js";
import type { SlackChatInstallation } from "../../src/providers/slack/domain/slackAgentTurn.js";
import { findInstallationWithOrg } from "../../src/providers/slack/installations.js";
import { createStatusTicker } from "../../src/ui/statusTicker.js";

const WORKSPACE_ID = process.env.E2E_SLACK_WORKSPACE ?? "T07NPTDCU69";
const STOP_AFTER_MS = Number(process.env.E2E_STOP_AFTER_MS ?? 10_000);

const results: Array<{ name: string; ok: boolean }> = [];
const check = (name: string, ok: boolean, detail?: string) => {
	results.push({ name, ok });
	console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const typingCalls: string[] = [];
const target = {
	post: async () => ({ id: "msg-1" }),
	startTyping: async (text: string) => {
		typingCalls.push(text);
		if (stopRequestedAt > 0) typingAfterStop.push(text);
	},
};

const installation = (await findInstallationWithOrg(
	"slack",
	WORKSPACE_ID,
)) as SlackChatInstallation | null;
if (!installation) throw new Error(`No slack installation for ${WORKSPACE_ID}`);
const providerUserId = installation.installed_by_provider_user_id ?? "";
const threadId = `stop-run-${Date.now().toString(36)}`;

const run = registerRun({
	key: runKeyForThread({
		channelId: threadId,
		provider: "slack",
		threadId,
		workspaceId: WORKSPACE_ID,
	}),
	kind: "message",
	ownerProviderUserId: providerUserId,
});

const ticker = createStatusTicker(target as never);
ticker.thinking();
let stopRequestedAt = 0;

const turnPromise = runSlackAgentTurn({
	channelId: threadId,
	installation,
	logger,
	onAction: (message) => {
		const label = typeof message === "string" ? message : message.label;
		console.log(`   action: ${label}`);
		ticker.activity(label);
	},
	onReasoning: () => {},
	onThinking: ticker.thinking,
	providerUserId,
	run,
	text: "Put customer leaf-0001 on a custom enterprise plan for $0/month.",
	threadId,
});

run.onStop = ticker.stop;
const typingAfterStop: string[] = [];
setTimeout(() => {
	stopRequestedAt = Date.now();
	console.log("   requesting stop…");
	void run.requestStop({ byUserId: providerUserId, reason: "user" });
}, STOP_AFTER_MS);

const turn = await turnPromise;
const stopLatencyMs = Date.now() - stopRequestedAt;
await new Promise((resolve) => setTimeout(resolve, 3_000));

check("turn ended as stopped", turn.kind === "stopped", `kind: ${turn.kind}`);
check(
	"stop landed fast",
	stopRequestedAt > 0 && stopLatencyMs < 5_000,
	`${stopLatencyMs}ms after requestStop`,
);
check(
	"typing status cleared last",
	typingCalls.length > 0 && typingCalls[typingCalls.length - 1] === "",
	`calls: ${typingCalls.length}`,
);
check(
	"no status shown after stop",
	typingAfterStop.every((text) => text === ""),
	`after-stop calls: ${JSON.stringify(typingAfterStop)}`,
);
process.exit(results.every((result) => result.ok) ? 0 : 1);
