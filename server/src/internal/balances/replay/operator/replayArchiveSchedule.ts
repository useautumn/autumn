import { z } from "zod/v4";
import type {
	ReplayArchiveClock,
	ReplayArchiveConfig,
} from "./replayArchiveContracts.js";

const MS_PER_SECOND = 1_000;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 4;
const DEFAULT_REQUESTS_PER_SECOND = 10;
const MAX_REQUESTS_PER_SECOND = 1_000;

const replayArchiveConfigSchema = z.object({
	concurrency: z
		.number()
		.int()
		.min(1)
		.max(MAX_CONCURRENCY)
		.default(DEFAULT_CONCURRENCY),
	requestsPerSecond: z
		.number()
		.positive()
		.max(MAX_REQUESTS_PER_SECOND)
		.default(DEFAULT_REQUESTS_PER_SECOND),
});

export type ReplayArchiveSettings = Readonly<{
	concurrency: number;
	intervalMs: number;
}>;

export function parseReplayArchiveSettings({
	config,
}: {
	config?: ReplayArchiveConfig;
}): ReplayArchiveSettings {
	const parsed = replayArchiveConfigSchema.parse(config ?? {});
	return {
		concurrency: parsed.concurrency,
		intervalMs: MS_PER_SECOND / parsed.requestsPerSecond,
	};
}

type SleepHandle = {
	timer: ReturnType<typeof setTimeout> | undefined;
	onSettle: (() => void) | undefined;
	signal: AbortSignal | undefined;
	resolve: () => void;
};

const settleSleep = ({ handle }: { handle: SleepHandle }): void => {
	if (handle.timer !== undefined) clearTimeout(handle.timer);
	if (handle.onSettle !== undefined)
		handle.signal?.removeEventListener("abort", handle.onSettle);
	handle.resolve();
};

const armSleep = ({
	handle,
	durationMs,
}: {
	handle: SleepHandle;
	durationMs: number;
}): void => {
	const onSettle = () => settleSleep({ handle });
	handle.onSettle = onSettle;
	handle.timer = setTimeout(onSettle, durationMs);
	handle.signal?.addEventListener("abort", onSettle, { once: true });
};

const sleepUntilElapsed = ({
	durationMs,
	signal,
}: {
	durationMs: number;
	signal?: AbortSignal;
}): Promise<void> =>
	new Promise<void>((resolve) => {
		if (signal?.aborted === true) {
			resolve();
			return;
		}
		armSleep({
			handle: { timer: undefined, onSettle: undefined, signal, resolve },
			durationMs,
		});
	});

export function createReplayArchiveClock(): ReplayArchiveClock {
	return { now: () => performance.now(), sleep: sleepUntilElapsed };
}

type ReplayLaneCursor = { next: number };

const runReplayLane = async <T>({
	items,
	cursor,
	run,
}: {
	items: readonly T[];
	cursor: ReplayLaneCursor;
	run: (params: { item: T }) => Promise<void>;
}): Promise<void> => {
	for (;;) {
		const index = cursor.next;
		const item = items[index];
		if (item === undefined) return;
		cursor.next = index + 1;
		await run({ item });
	}
};

/** Lanes pull the next item in manifest order, so at most `laneCount` customers
 *  are ever in flight and no customer is fanned out ahead of the bound. Every
 *  lane is awaited before the first failure is rethrown, so a rejected lane
 *  never leaves the others running unobserved. */
export async function runReplayLanes<T>({
	items,
	laneCount,
	run,
}: {
	items: readonly T[];
	laneCount: number;
	run: (params: { item: T }) => Promise<void>;
}): Promise<void> {
	const cursor: ReplayLaneCursor = { next: 0 };
	const lanes: Promise<void>[] = [];
	const active = Math.min(laneCount, items.length);
	for (let index = 0; index < active; index += 1)
		lanes.push(runReplayLane({ items, cursor, run }));
	const settled = await Promise.allSettled(lanes);
	const failed = settled.find((result) => result.status === "rejected");
	if (failed !== undefined) throw failed.reason;
}
