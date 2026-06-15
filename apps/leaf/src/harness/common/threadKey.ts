import type { AppEnv } from "@autumn/shared";
import type { ThreadRef } from "../../agent/runMessage/types.js";

/** Stable per-thread, per-env key used to scope persisted harness sessions. */
export const buildThreadKey = ({
	env,
	thread,
}: {
	env: AppEnv;
	thread: ThreadRef;
}) =>
	[
		thread.provider,
		thread.workspaceId,
		thread.channelId,
		thread.threadId,
		env,
	].join(":");
