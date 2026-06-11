import { mkdir } from "node:fs/promises";
import type {
	Query,
	SDKMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
	Harness,
	HarnessEvent,
	HarnessSession,
	HarnessSessionConfig,
	HarnessUserMessage,
} from "../types.js";
import {
	approvalPredicate,
	buildCanUseTool,
	mapQueryToEvents,
	type PendingApprovalRef,
	type SessionRef,
} from "./eventMapping.js";
import { claudeCodeSdk } from "./sdk.js";
import { toContentBlocks } from "./utils/messageUtils.js";
import { buildQueryOptions } from "./utils/queryOptionsUtils.js";

const createClaudeCodeSession = async ({
	config,
	resumeId,
}: {
	config: HarnessSessionConfig;
	resumeId?: string;
}): Promise<HarnessSession> => {
	const { configDir, cwd } = config.workspace;
	await Promise.all([
		mkdir(cwd, { recursive: true }),
		configDir ? mkdir(configDir, { recursive: true }) : undefined,
	]);

	const sessionRef: SessionRef = { current: resumeId };
	let activeQuery: Query | undefined;

	async function* runTurn(
		message: HarnessUserMessage,
	): AsyncGenerator<HarnessEvent> {
		if (activeQuery) {
			throw new Error("Harness session already has a turn in progress.");
		}
		const pendingApprovalRef: PendingApprovalRef = {};

		const userMessage: SDKUserMessage = {
			message: { content: toContentBlocks({ message }), role: "user" },
			parent_tool_use_id: null,
			type: "user",
		};
		async function* promptIterable() {
			yield userMessage;
		}

		const currentQuery = claudeCodeSdk.query({
			options: {
				...buildQueryOptions({ config, sessionId: sessionRef.current }),
				canUseTool: buildCanUseTool({
					pendingApprovalRef,
					requiresApproval: approvalPredicate(config.requiresApproval),
				}),
			},
			prompt: promptIterable(),
		});
		activeQuery = currentQuery;

		try {
			yield* mapQueryToEvents({
				messages: currentQuery as AsyncIterable<SDKMessage>,
				pendingApprovalRef,
				sessionRef,
			});
		} finally {
			try {
				currentQuery.close();
			} catch {
				// Subprocess already exited.
			}
			activeQuery = undefined;
		}
	}

	return {
		close: async () => {
			activeQuery?.close();
			activeQuery = undefined;
		},
		get id() {
			return sessionRef.current;
		},
		interrupt: async () => {
			await activeQuery?.interrupt();
		},
		send: (message) => runTurn(message),
	};
};

export const createClaudeCodeHarness = (): Harness => ({
	createSession: (config) => createClaudeCodeSession({ config }),
	name: "claude-code",
	resumeSession: (id, config) =>
		createClaudeCodeSession({ config, resumeId: id }),
});
