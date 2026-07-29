import type { AppEnv } from "@autumn/shared";
import type { ThreadRef } from "../../agent/runMessage/types.js";

/** Stable per-thread, per-env key used to scope persisted harness sessions. */
export const buildThreadKey = ({
	env,
	thread,
	userId,
}: {
	env: AppEnv;
	thread: ThreadRef;
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
