import type { AppEnv } from "@autumn/shared";
import type { AgentThreadRef } from "../domain/agentTurnContext.js";

export const buildAgentThreadKey = ({
	env,
	thread,
	userId,
}: {
	env: AppEnv;
	thread: AgentThreadRef;
	userId?: string;
}) =>
	[
		thread.provider,
		thread.workspaceId,
		thread.channelId,
		thread.threadId,
		env,
		...(userId ? [`user:${userId}`] : []),
	].join(":");
