import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import type { ThreadRef } from "../../agent/runMessage/types.js";
import { buildThreadKey } from "../../harness/common/threadKey.js";
import { setHarnessSessionTitleIfEmpty } from "../../harness/eve/repo.js";
import { DEFAULT_CHAT_ENV_MODEL } from "../../lib/chatAgentConfig.js";
import type { ChatDb } from "../../lib/db.js";

const titleSchema = z.strictObject({ title: z.string().min(1).max(60) });

const TITLE_INSTRUCTIONS = `You title chat conversations for a billing dashboard.
Given the user's first message, produce a short noun-phrase title (3-6 words, no quotes, no trailing punctuation) describing what they want. Examples: "Increase Pro plan price", "Set up usage billing", "List current plans".`;

/** Kick this off in parallel with the agent run — it's a cheap one-shot. */
export const generateThreadTitle = async ({
	logger,
	text,
}: {
	logger: AutumnLogger;
	text: string;
}): Promise<string | undefined> => {
	try {
		const agent = new Agent({
			id: "leaf-thread-title",
			name: "Leaf Thread Title",
			instructions: TITLE_INSTRUCTIONS,
			model: DEFAULT_CHAT_ENV_MODEL,
		});
		const output = await agent.generate(text.slice(0, 2000), {
			maxSteps: 1,
			structuredOutput: { schema: titleSchema },
		});
		return output.object.title.trim() || undefined;
	} catch (error) {
		logger.warn("Thread title generation failed", {
			event: "leaf.thread_title_failed",
			data: { error: String(error) },
		});
		return undefined;
	}
};

/** Await only after the engine run — the session row must exist to title it. */
export const persistThreadTitle = async ({
	db,
	env,
	logger,
	orgId,
	thread,
	titlePromise,
}: {
	db: ChatDb;
	env: AppEnv;
	logger: AutumnLogger;
	orgId: string;
	thread: ThreadRef;
	titlePromise: Promise<string | undefined>;
}) => {
	const title = await titlePromise;
	if (!title) return;
	try {
		await setHarnessSessionTitleIfEmpty({
			db,
			env,
			orgId,
			threadKey: buildThreadKey({ env, thread }),
			title,
		});
	} catch (error) {
		logger.warn("Thread title persist failed", {
			event: "leaf.thread_title_persist_failed",
			data: { error: String(error) },
		});
	}
};
