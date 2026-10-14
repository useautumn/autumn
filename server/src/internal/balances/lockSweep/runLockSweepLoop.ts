import { ms } from "@autumn/shared";
import type { CronContext } from "@/cron/utils/CronContext.js";
import { isActiveSlot } from "@/queue/blueGreen/blueGreenGate.js";
import {
	type LockSweepBatchResult,
	runLockSweepBatch,
} from "./runLockSweepBatch.js";

const ACTIVE_DELAY_MS = ms.seconds(1);
const IDLE_DELAY_MS = ms.seconds(30);

const shouldSweepLocks = (): boolean =>
	process.env.DISABLE_CRON !== "true" && isActiveSlot({ serviceName: "cron" });

export const lockSweepResultToDelayMs = ({
	result,
}: {
	result: LockSweepBatchResult | null;
}): number => {
	const wasCutShort =
		result !== null &&
		result.fetched > 0 &&
		result.fetched % result.pageSize === 0;
	return wasCutShort ? ACTIVE_DELAY_MS : IDLE_DELAY_MS;
};

const sweepOnce = async ({
	ctx,
}: {
	ctx: CronContext;
}): Promise<LockSweepBatchResult | null> => {
	try {
		return await runLockSweepBatch({ ctx });
	} catch (error) {
		ctx.logger.error(
			{ jobName: "lock-sweep", err: error },
			"[lock-sweep] batch failed",
		);
		return null;
	}
};

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

export const runLockSweepLoop = async ({
	ctx,
	signal,
}: {
	ctx: CronContext;
	signal: AbortSignal;
}) => {
	while (!signal.aborted) {
		const result = shouldSweepLocks() ? await sweepOnce({ ctx }) : null;
		await waitForNextBatch({
			delayMs: lockSweepResultToDelayMs({ result }),
			signal,
		});
	}
};
