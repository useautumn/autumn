import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import { TestFeature } from "@tests/setup/v2Features";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { checkParamsToCheckCommand } from "@/internal/balances/check/balanceWorker/balanceWorkerCheckRequest.js";
import { trackParamsToTrackCommand } from "@/internal/balances/track/balanceWorker/balanceWorkerTrackRequest.js";
import { generateId } from "@/utils/genUtils.js";

type TrackClient = Pick<BalanceWorkerClient, "check" | "track">;

export type TrackTally = {
	applied: number;
	rejected: number;
	failed: number;
	latenciesMs: number[];
	firstLatenciesMs: number[];
};

export const createTrackTally = (): TrackTally => ({
	applied: 0,
	rejected: 0,
	failed: 0,
	latenciesMs: [],
	firstLatenciesMs: [],
});

const commandCtxOf = ({ ctx }: { ctx: AutumnContext }) => ({
	...ctx,
	id: generateId("bench"),
	timestamp: Date.now(),
});

export const sendCheck = async ({
	ctx,
	client,
	customerId,
}: {
	ctx: AutumnContext;
	client: TrackClient;
	customerId: string;
}): Promise<void> => {
	await client.check({
		command: checkParamsToCheckCommand({
			ctx: commandCtxOf({ ctx }),
			body: { customer_id: customerId, feature_id: TestFeature.Messages },
		}),
	});
};

export const sendTrack = async ({
	ctx,
	client,
	customerId,
	tally,
	first = false,
}: {
	ctx: AutumnContext;
	client: TrackClient;
	customerId: string;
	tally: TrackTally;
	first?: boolean;
}): Promise<"applied" | "rejected" | "failed"> => {
	const startedAt = performance.now();
	let status: "applied" | "rejected";
	try {
		const reply = await client.track({
			command: trackParamsToTrackCommand({
				ctx: commandCtxOf({ ctx }),
				body: {
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
					skip_event: true,
				},
			}),
		});
		status = reply.result.status === "applied" ? "applied" : "rejected";
	} catch {
		tally.failed += 1;
		return "failed";
	}
	tally[status] += 1;
	const latencyMs = performance.now() - startedAt;
	tally.latenciesMs.push(latencyMs);
	if (first) tally.firstLatenciesMs.push(latencyMs);
	return status;
};

export const mapWithLimit = async <Item>({
	items,
	limit,
	run,
}: {
	items: readonly Item[];
	limit: number;
	run: (item: Item) => Promise<void>;
}): Promise<void> => {
	let next = 0;
	const workers = Array.from(
		{ length: Math.min(limit, items.length) },
		async () => {
			while (next < items.length) {
				const item = items[next];
				next += 1;
				if (item !== undefined) await run(item);
			}
		},
	);
	await Promise.all(workers);
};

export type SteadyTracks = {
	add(params: { customerIds: string[] }): void;
	stop(): Promise<void>;
	tally: TrackTally;
	perCustomerApplied: Map<string, number>;
};

export const startSteadyTracks = ({
	ctx,
	client,
	intervalMs,
}: {
	ctx: AutumnContext;
	client: TrackClient;
	intervalMs: number;
}): SteadyTracks => {
	const tally = createTrackTally();
	const perCustomerApplied = new Map<string, number>();
	const loops: Promise<void>[] = [];
	let stopped = false;

	const loopFor = async ({ customerId }: { customerId: string }) => {
		let first = true;
		while (!stopped) {
			const status = await sendTrack({ ctx, client, customerId, tally, first });
			first = false;
			if (status === "applied")
				perCustomerApplied.set(
					customerId,
					(perCustomerApplied.get(customerId) ?? 0) + 1,
				);
			await Bun.sleep(intervalMs);
		}
	};

	return {
		add: ({ customerIds }) => {
			for (const customerId of customerIds) {
				perCustomerApplied.set(
					customerId,
					perCustomerApplied.get(customerId) ?? 0,
				);
				loops.push(loopFor({ customerId }));
			}
		},
		stop: async () => {
			stopped = true;
			await Promise.all(loops);
		},
		tally,
		perCustomerApplied,
	};
};

export const percentileOf = ({
	values,
	percentile,
}: {
	values: readonly number[];
	percentile: number;
}): number | null => {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(
		sorted.length - 1,
		Math.ceil((percentile / 100) * sorted.length) - 1,
	);
	return Math.round((sorted[Math.max(index, 0)] ?? 0) * 10) / 10;
};
