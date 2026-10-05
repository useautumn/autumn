import { afterAll, describe, expect, mock, spyOn, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

type QueueCall = {
	jobName: string;
	payload: Record<string, unknown>;
	messageGroupId?: string;
	messageDeduplicationId?: string;
};

const ORG_ID = "org_1";
const CUSTOMER_ID = "cus_1";
const CUS_ENT_ID = "cus_ent_messages";
const MESSAGES_INTERNAL_ID = "fe_messages";

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/balances/getCachedFeatureBalances.js",
	() => ({
		getCachedFeatureBalance: async ({ featureId }: { featureId: string }) => ({
			kind: "ok",
			value: {
				featureId,
				balances: [
					{
						id: CUS_ENT_ID,
						feature_id: featureId,
						balance: 0,
						adjustment: 0,
						entities: { ent_1: { id: "ent_1", balance: 480, adjustment: 0 } },
						usage_windows: null,
						next_reset_at: null,
						entity_count: 1,
						cache_version: 0,
						isEntityLevel: true,
						rollovers: [],
					},
				],
			},
		}),
	}),
);

// Refresh scheduling only exists on the legacy (non-worker) sync path.
const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";

const { JobName } = await import("@/queue/JobName.js");
const { SyncBatchingManagerV3 } = await import(
	"@/internal/balances/utils/sync/SyncBatchingManagerV3.js"
);
const { syncItemV4 } = await import(
	"@/internal/balances/utils/sync/syncItemV4.js"
);
const {
	globalRefreshEntityAggregateBatchingManager,
	RefreshEntityAggregateBatchingManager,
} = await import("@/internal/balances/utils/refreshEntityAggregate/index.js");

const createCtx = () => ({
	org: { id: ORG_ID },
	env: AppEnv.Sandbox,
	features: [{ id: "messages", internal_id: MESSAGES_INTERNAL_ID }],
	extraLogs: {},
	logger: { warn: mock(() => {}), info: mock(() => {}), debug: mock(() => {}) },
	db: {
		execute: mock(async () => [
			{
				sync_balances_v2: {
					updates: { [CUS_ENT_ID]: {} },
					rollover_updates: {},
				},
			},
		]),
	},
});

/** Enqueues sync-v4 jobs the way the track path does, one per tumbling window. */
const enqueueTrackSyncJobs = async ({
	trackCount,
	windowCount,
}: {
	trackCount: number;
	windowCount: number;
}): Promise<QueueCall[]> => {
	const syncJobs: QueueCall[] = [];
	const syncManager = new SyncBatchingManagerV3({
		addTaskToQueueFn: async (args) => {
			syncJobs.push(structuredClone(args) as QueueCall);
		},
	});

	const tracksPerWindow = trackCount / windowCount;
	for (let window = 0; window < windowCount; window++) {
		for (let i = 0; i < tracksPerWindow; i++) {
			syncManager.addSyncItem({
				customerId: CUSTOMER_ID,
				orgId: ORG_ID,
				env: AppEnv.Sandbox,
				cusEntIds: [CUS_ENT_ID],
				entityId: "ent_1",
				modifiedCusEntIdsByFeatureId: { messages: [CUS_ENT_ID] },
			});
		}
		// Ends the window, as its 1s timer would.
		await syncManager.flush();
	}

	return syncJobs;
};

describe("syncItemV4 refresh dedup", () => {
	test("sync-v4 jobs from 20 tracks across several windows enqueue exactly one RefreshEntityAggregate", async () => {
		const refreshCalls: QueueCall[] = [];
		const refreshManager = new RefreshEntityAggregateBatchingManager({
			addTaskToQueueFn: async (args) => {
				refreshCalls.push(structuredClone(args) as QueueCall);
			},
		});
		// syncItemV4 schedules on the global manager; route it to a manager whose enqueues we capture.
		const scheduleSpy = spyOn(
			globalRefreshEntityAggregateBatchingManager,
			"schedule",
		).mockImplementation((args) => refreshManager.schedule(args));

		try {
			const syncJobs = await enqueueTrackSyncJobs({
				trackCount: 20,
				windowCount: 4,
			});
			expect(syncJobs).toHaveLength(4);
			expect(
				syncJobs.every((job) => job.jobName === JobName.SyncBalanceBatchV4),
			).toBe(true);

			const ctx = createCtx();
			for (const job of syncJobs) {
				await syncItemV4({ ctx: ctx as never, payload: job.payload as never });
			}

			expect(ctx.db.execute).toHaveBeenCalledTimes(4);
			expect(scheduleSpy).toHaveBeenCalledTimes(4);

			// Drains the trailing-edge timer instead of waiting for the bucket to end.
			await refreshManager.flush();

			expect(refreshCalls).toHaveLength(1);
			expect(refreshCalls[0].jobName).toBe(JobName.RefreshEntityAggregate);
			expect(refreshCalls[0].payload).toMatchObject({
				customerId: CUSTOMER_ID,
				orgId: ORG_ID,
				env: AppEnv.Sandbox,
				internalFeatureIds: [MESSAGES_INTERNAL_ID],
			});
			expect(refreshCalls[0].messageGroupId).toBe(
				`refresh-agg:${ORG_ID}:${AppEnv.Sandbox}:${CUSTOMER_ID}`,
			);
		} finally {
			scheduleSpy.mockRestore();
		}
	});
});

afterAll(() => {
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
});
