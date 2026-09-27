import type { AutumnLogger } from "@autumn/logging";
import type { StreamConsumer, StreamRecord } from "../types/streamConsumer.js";
import { isStoreFailure } from "./isStoreFailure.js";

const INITIAL_BACKOFF_MS = 200;
const MAX_BACKOFF_MS = 5_000;
/** Consecutive store failures before the wait is reported, and again every so many after. */
const DEGRADED_AFTER_ATTEMPTS = 5;

export type LandRecordsContext = {
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	/** Ends a wait on the store when herald stops. */
	signal: AbortSignal;
	sleep?: (params: { delayMs: number; signal: AbortSignal }) => Promise<void>;
};

const defaultSleep = ({
	delayMs,
	signal,
}: {
	delayMs: number;
	signal: AbortSignal;
}): Promise<void> =>
	new Promise((resolve) => {
		const timer = setTimeout(finish, delayMs);
		function finish(): void {
			clearTimeout(timer);
			signal.removeEventListener("abort", finish);
			resolve();
		}
		signal.addEventListener("abort", finish, { once: true });
	});

/** The batch again, for as long as the store is the problem; returns false once herald is stopping. */
const handleWhileStoreAnswers = async ({
	ctx,
	job,
	records,
}: {
	ctx: LandRecordsContext;
	job: StreamConsumer;
	records: StreamRecord[];
}): Promise<{ landed: boolean; cause?: unknown }> => {
	const sleep = ctx.sleep ?? defaultSleep;
	let delayMs = INITIAL_BACKOFF_MS;
	for (let attempt = 1; ; attempt++) {
		try {
			await job.handle({ records });
			if (attempt > DEGRADED_AFTER_ATTEMPTS)
				ctx.logger.info(
					{ type: "herald_store_recovered", data: { job: job.name, attempt } },
					"Herald's store answered again",
				);
			return { landed: true };
		} catch (cause) {
			if (!isStoreFailure(cause)) return { landed: false, cause };
			if (attempt % DEGRADED_AFTER_ATTEMPTS === 0)
				ctx.logger.warn(
					{
						error: cause,
						type: "herald_store_waiting",
						data: { job: job.name, attempt },
					},
					"Herald's store keeps refusing a batch; still retrying",
				);
			await sleep({ delayMs, signal: ctx.signal });
			if (ctx.signal.aborted) return { landed: false };
			delayMs = Math.min(delayMs * 4, MAX_BACKOFF_MS);
		}
	}
};

/**
 * Lands a batch so that no single record can hold its partition: a store failure waits in place with capped backoff
 * (never thrown to Kafka), and a failure in the job's own code is narrowed to the one record, which is skipped loudly.
 */
export const landRecords = async ({
	ctx,
	job,
	records,
}: {
	ctx: LandRecordsContext;
	job: StreamConsumer;
	records: StreamRecord[];
}): Promise<void> => {
	if (records.length === 0 || ctx.signal.aborted) return;
	const outcome = await handleWhileStoreAnswers({ ctx, job, records });
	if (outcome.landed || ctx.signal.aborted) return;
	if (records.length > 1) {
		const middle = Math.ceil(records.length / 2);
		await landRecords({ ctx, job, records: records.slice(0, middle) });
		await landRecords({ ctx, job, records: records.slice(middle) });
		return;
	}
	const [record] = records;
	ctx.logger.error(
		{
			error: outcome.cause,
			type: "herald_record_skipped",
			data: {
				job: job.name,
				topic: record?.position.topic,
				partition: record?.position.partition,
				offset: record?.position.offset.toString(),
			},
		},
		"Herald skipped a record its job could not handle",
	);
};
