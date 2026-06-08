import {
	type AutumnLogger,
	createAppLogger,
	createSessionId,
	createTraceId,
} from "@autumn/logging";

export const logger = createAppLogger({
	service: "leaf",
	dataset: process.env.LEAF_LOG_DATASET ?? "leaf",
	preset: "default",
});

export const createLeafSessionContext = ({
	channelId,
	provider,
	providerUserId,
	threadId,
	workspaceId,
}: {
	channelId: string;
	provider: string;
	providerUserId: string;
	threadId: string;
	workspaceId: string;
}) => {
	const traceId = createTraceId();
	const sessionId = createSessionId({
		parts: {
			channelId,
			provider,
			threadId,
			workspaceId,
		},
	});
	return {
		agentRunId: createTraceId(),
		sessionId,
		traceId,
		context: {
			provider,
			provider_user_id: providerUserId,
			session_id: sessionId,
			trace_id: traceId,
			slack_channel_id: channelId,
			slack_thread_id: threadId,
			slack_workspace_id: workspaceId,
		},
	};
};

export const addLeafContext = (
	baseLogger: AutumnLogger,
	context: Record<string, unknown>,
): AutumnLogger =>
	baseLogger.child({
		context: {
			context,
		},
	});
