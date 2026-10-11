import type { QaEnv } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { requireQaEnvRow } from "../repos/qaEnvsRepo.ts";
import { toQaEnv } from "./toQaEnv.ts";

const POLL_MS = 5_000;
// Executor cuts tool calls off at 60 s, so a wait returns well before that and the agent calls again.
const MAX_WAIT_MS = 45_000;

const isServing = async ({ url }: { url: string }) =>
	fetch(`${url}/__qa_wake_status`, { signal: AbortSignal.timeout(10_000) })
		.then((r) => r.json() as Promise<{ ready?: boolean }>)
		.then((r) => r.ready === true)
		.catch(() => false);

/** Waits until the latest build is live and the stack answers; returns early on failure or after 45 s. */
export const waitForWarmQaEnv = async ({
	ctx,
	name,
}: {
	ctx: TwdContext;
	name: string;
}) => {
	const deadline = Date.now() + MAX_WAIT_MS;
	for (;;) {
		const row = await requireQaEnvRow({ ctx, name });
		const env: QaEnv = await toQaEnv({ ctx, row });
		if (env.state === "failed" || env.state === "deleted")
			return { env, warm: false };
		// A re-ship isn't live until its job applies it; until then the old build still answers.
		if (
			row.appliedVersion >= row.requestVersion &&
			env.state === "ready" &&
			!env.building &&
			(await isServing({ url: env.url }))
		)
			return { env, warm: true };
		if (Date.now() + POLL_MS >= deadline) return { env, warm: false };
		await Bun.sleep(POLL_MS);
	}
};
