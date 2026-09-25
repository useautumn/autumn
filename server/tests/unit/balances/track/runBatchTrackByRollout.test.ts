import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

type Entry = { item: TrackParams; index: number };
const calls = { worker: [] as Entry[][], legacy: [] as Entry[][] };

await mockModuleWithRestore(
	"@/internal/balances/track/balanceWorker/runBalanceWorkerBatchTrack.js",
	() => ({
		runBalanceWorkerBatchTrack: async ({ entries }: { entries: Entry[] }) => {
			calls.worker.push(entries);
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/balances/track/runBatchTrack.js",
	() => ({
		runBatchTrack: async ({ entries }: { entries: Entry[] }) => {
			calls.legacy.push(entries);
		},
	}),
);

import * as rolloutAccess from "@/external/balanceWorker/getBalanceWorkerRolloutEnabled.js";
import { runBatchTrackByRollout } from "@/internal/balances/track/runBatchTrackByRollout.js";
import { _setRolloutConfigForTesting } from "@/internal/misc/rollouts/rolloutConfigStore.js";
import {
	ACTIVE_ROLLOUT_ID,
	getCustomerBucket,
} from "@/internal/misc/rollouts/rolloutUtils.js";

const ORG_ID = "org_batch";
let overrideSpy: ReturnType<typeof spyOn> | undefined;
const ctx = { org: { id: ORG_ID } } as AutumnContext;

const customerInBucketRange = ({ min, max }: { min: number; max: number }) => {
	for (let i = 0; i < 10_000; i++) {
		const customerId = `cus_${i}`;
		const bucket = getCustomerBucket({ customerId });
		if (bucket >= min && bucket < max) return customerId;
	}
	throw new Error("no customer in range");
};
const routedCustomer = customerInBucketRange({ min: 0, max: 50 });
const legacyCustomer = customerInBucketRange({ min: 50, max: 100 });
const track = (customer_id: string): TrackParams => ({
	customer_id,
	feature_id: "messages",
	value: 1,
});

describe("runBatchTrackByRollout", () => {
	beforeEach(() => {
		calls.worker = [];
		calls.legacy = [];
		// Unset override: the config decides, half the buckets on the worker.
		overrideSpy = spyOn(
			rolloutAccess,
			"getBalanceWorkerRolloutOverride",
		).mockImplementation(() => undefined);
		_setRolloutConfigForTesting({
			config: {
				rollouts: {
					[ACTIVE_ROLLOUT_ID]: {
						percent: 50,
						previousPercent: 50,
						changedAt: 0,
						orgs: {},
					},
				},
			},
		});
	});
	afterEach(() => {
		overrideSpy?.mockRestore();
		_setRolloutConfigForTesting({ config: { rollouts: {} } });
	});

	test("splits items by customer and keeps each item's position", async () => {
		await runBatchTrackByRollout({
			ctx,
			body: [
				track(legacyCustomer),
				track(routedCustomer),
				track(legacyCustomer),
			],
		});
		expect(calls.worker).toEqual([[{ item: track(routedCustomer), index: 1 }]]);
		expect(calls.legacy).toEqual([
			[
				{ item: track(legacyCustomer), index: 0 },
				{ item: track(legacyCustomer), index: 2 },
			],
		]);
	});

	test("an all-legacy batch never calls the worker lane", async () => {
		await runBatchTrackByRollout({ ctx, body: [track(legacyCustomer)] });
		expect(calls.worker).toEqual([]);
		expect(calls.legacy).toHaveLength(1);
	});

	test("an all-worker batch never calls the legacy lane", async () => {
		await runBatchTrackByRollout({ ctx, body: [track(routedCustomer)] });
		expect(calls.legacy).toEqual([]);
		expect(calls.worker).toHaveLength(1);
	});
});
