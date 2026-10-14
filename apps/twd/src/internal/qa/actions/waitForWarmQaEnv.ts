import type { QaEnv } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { requireQaEnvRow } from "../repos/qaEnvsRepo.ts";
import { toQaEnv } from "./toQaEnv.ts";

const POLL_MS = 5_000;
const MAX_WAIT_MS = 45_000;

const isServing = async ({
	url,
	timeoutMs,
}: {
	url: string;
	timeoutMs: number;
}) =>
	fetch(`${url}/__qa_wake_status`, { signal: AbortSignal.timeout(timeoutMs) })
		.then((r) => r.json() as Promise<{ ready?: boolean }>)
		.then((r) => r.ready === true)
		.catch(() => false);

export const waitForWarmQaEnv = async ({
	ctx,
	name,
	startedAt = Date.now(),
}: {
	ctx: TwdContext;
	name: string;
	startedAt?: number;
}) => {
	const deadline = startedAt + MAX_WAIT_MS;
	const remaining = () => Math.max(1_000, deadline - Date.now());
	for (;;) {
		const row = await requireQaEnvRow({ ctx, name });
		const env: QaEnv = await toQaEnv({
			ctx,
			row,
			statusTimeoutMs: remaining(),
		});
		if (env.state === "failed" || env.state === "deleted" || env.error)
			return { env, warm: false };
		if (
			row.appliedVersion >= row.requestVersion &&
			env.state === "ready" &&
			!env.building &&
			(await isServing({ url: env.url, timeoutMs: remaining() }))
		)
			return { env, warm: true };
		if (Date.now() + POLL_MS >= deadline) return { env, warm: false };
		await Bun.sleep(POLL_MS);
	}
};
