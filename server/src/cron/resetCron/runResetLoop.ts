import { ms } from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import { isResetJobEnabled } from "@/internal/misc/resetJob/resetJobStore.js";
import { isActiveSlot } from "@/queue/blueGreen/blueGreenGate.js";
import type { CronContext } from "../utils/CronContext.js";
import { runResetBatch } from "./runResetBatch.js";

const ACTIVE_DELAY_MS = ms.seconds(1);
const IDLE_DELAY_MS = ms.seconds(5);

type ResetBatchResult = Awaited<ReturnType<typeof runResetBatch>>;

const waitForNextBatch = async ({
	delayMs,
	signal,
}: {
	delayMs: number;
	signal: AbortSignal;
}) => {
	if (signal.aborted) return;
	await new Promise<void>((resolve) => {
		const finish = () => {
			clearTimeout(timer);
			signal.removeEventListener("abort", finish);
			resolve();
		};
		const timer = setTimeout(finish, delayMs);
		signal.addEventListener("abort", finish, { once: true });
	});
};

export const runResetLoop = async ({
	ctx,
	signal,
	isEnabled = isResetJobEnabled,
	isActive = () => isActiveSlot({ serviceName: "cron" }),
	runBatch = runResetBatch,
	wait = waitForNextBatch,
}: {
	ctx: CronContext;
	signal: AbortSignal;
	isEnabled?: () => boolean;
	isActive?: () => boolean;
	runBatch?: (params: { ctx: CronContext }) => Promise<ResetBatchResult>;
	wait?: (params: { delayMs: number; signal: AbortSignal }) => Promise<void>;
}) => {
	while (!signal.aborted) {
		let delayMs = IDLE_DELAY_MS;

		if (process.env.DISABLE_CRON !== "true" && isEnabled() && isActive()) {
			try {
				const result = await runBatch({ ctx });
				if (result.fetched === result.batchSize) {
					delayMs = ACTIVE_DELAY_MS;
				}
			} catch (error) {
				ctx.logger.error(
					{ jobName: "reset-cus-ents", err: error },
					"[reset-cus-ents] batch failed",
				);
				Sentry.captureException(error, {
					extra: { context: "runResetLoop.runBatch" },
				});
			}
		}

		await wait({ delayMs, signal });
	}
};
