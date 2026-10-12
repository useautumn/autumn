import type { QaEnv } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getQaEnv } from "./listQaEnvs.ts";

const POLL_MS = 5_000;
const MAX_WAIT_MS = 9 * 60_000;

const isServing = async ({ url }: { url: string }) =>
	fetch(`${url}/__qa_wake_status`, { signal: AbortSignal.timeout(10_000) })
		.then((r) => r.json() as Promise<{ ready?: boolean }>)
		.then((r) => r.ready === true)
		.catch(() => false);

/** Waits until the latest build is live and the stack answers; returns early on failure or after ~9 min. */
export const waitForWarmQaEnv = async ({
	ctx,
	name,
}: {
	ctx: TwdContext;
	name: string;
}) => {
	const deadline = Date.now() + MAX_WAIT_MS;
	let env: QaEnv = await getQaEnv({ ctx, name });
	while (Date.now() < deadline) {
		if (env.state === "failed" || env.state === "deleted")
			return { env, warm: false };
		if (
			env.state === "ready" &&
			!env.building &&
			(await isServing({ url: env.url }))
		)
			return { env, warm: true };
		await Bun.sleep(POLL_MS);
		env = await getQaEnv({ ctx, name });
	}
	return { env, warm: false };
};
