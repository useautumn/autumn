import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import chalk from "chalk";
import {
	type QueueSyncPayload,
	SyncBatchingManagerV2,
} from "@/internal/balances/utils/sync/SyncBatchingManagerV2.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createMockQueue = () => {
	const calls: QueueSyncPayload[] = [];
	const fn = async (args: QueueSyncPayload) => {
		calls.push(structuredClone(args));
	};
	return { fn, calls };
};

const addItems = ({
	manager,
	count,
	customerId = "cust-1",
	cusEntIds = ["ce-1"],
	rolloverIds,
}: {
	manager: SyncBatchingManagerV2;
	count: number;
	customerId?: string;
	cusEntIds?: string[];
	rolloverIds?: string[];
}) => {
	for (let i = 0; i < count; i++) {
		manager.addSyncItem({
			customerId,
			orgId: "org-1",
			env: AppEnv.Sandbox,
			cusEntIds,
			rolloverIds,
			region: "us-east-1",
		});
	}
};

// ═══════════════════════════════════════════════════════════════════
// 1. Fixed window: rapid items within 1 window → 1 flush
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("sync-batch-1: rapid addSyncItem calls within one window → 1 flush")}`,
	async () => {
		const { fn, calls } = createMockQueue();
		const manager = new SyncBatchingManagerV2({
			addTaskToQueueFn: fn,
			batchWindowMs: 100,
		});

		// Fire 500 sync items rapidly (same customer, same cusEntIds)
		addItems({ manager, count: 500 });

		// Nothing queued yet — timer hasn't fired
		expect(calls.length).toBe(0);

		// Wait for window to fire
		await wait(200);

		expect(calls.length).toBe(1);
		expect(calls[0].payload.cusEntIds).toEqual(["ce-1"]);
		expect(calls[0].payload.customerId).toBe("cust-1");
	},
	{ timeout: 5_000 },
);

// ═══════════════════════════════════════════════════════════════════
// 2. Fixed window fires on schedule even during continuous load
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("sync-batch-2: fixed window fires on schedule during continuous load")}`,
	async () => {
		const { fn, calls } = createMockQueue();
		const manager = new SyncBatchingManagerV2({
			addTaskToQueueFn: fn,
			batchWindowMs: 100,
		});

		// Add items continuously every 20ms for 500ms
		const interval = setInterval(() => {
			addItems({ manager, count: 1 });
		}, 20);

		await wait(600);
		clearInterval(interval);

		// Flush any leftovers
		await manager.flush();

		// Fixed window of 100ms over 500ms → should produce ~5 flushes
		// (NOT 1, which would indicate debounce behavior)
		expect(calls.length).toBeGreaterThanOrEqual(3);
		expect(calls.length).toBeLessThanOrEqual(8);
	},
	{ timeout: 5_000 },
);

// ═══════════════════════════════════════════════════════════════════
// 3. Different customers get independent batches
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("sync-batch-3: different customers produce separate flushes")}`,
	async () => {
		const { fn, calls } = createMockQueue();
		const manager = new SyncBatchingManagerV2({
			addTaskToQueueFn: fn,
			batchWindowMs: 50,
		});

		addItems({ manager, count: 10, customerId: "cust-A" });
		addItems({ manager, count: 10, customerId: "cust-B" });

		const stats = manager.getStats();
		expect(stats.totalCustomers).toBe(2);

		await wait(150);

		expect(calls.length).toBe(2);
		const customerIds = calls.map((c) => c.payload.customerId).sort();
		expect(customerIds).toEqual(["cust-A", "cust-B"]);
	},
	{ timeout: 5_000 },
);

// ═══════════════════════════════════════════════════════════════════
// 4. cusEntIds from multiple adds merge into one flush
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("sync-batch-4: cusEntIds merge across multiple addSyncItem calls")}`,
	async () => {
		const { fn, calls } = createMockQueue();
		const manager = new SyncBatchingManagerV2({
			addTaskToQueueFn: fn,
			batchWindowMs: 100,
		});

		manager.addSyncItem({
			customerId: "cust-1",
			orgId: "org-1",
			env: AppEnv.Sandbox,
			cusEntIds: ["ce-1"],
			region: "us-east-1",
		});

		manager.addSyncItem({
			customerId: "cust-1",
			orgId: "org-1",
			env: AppEnv.Sandbox,
			cusEntIds: ["ce-2"],
			region: "us-east-1",
		});

		manager.addSyncItem({
			customerId: "cust-1",
			orgId: "org-1",
			env: AppEnv.Sandbox,
			cusEntIds: ["ce-1", "ce-3"],
			rolloverIds: ["r-1"],
			region: "us-east-1",
		});

		await wait(200);

		expect(calls.length).toBe(1);
		expect(calls[0].payload.cusEntIds.sort()).toEqual(["ce-1", "ce-2", "ce-3"]);
		expect(calls[0].payload.rolloverIds).toEqual(["r-1"]);
	},
	{ timeout: 5_000 },
);

// ═══════════════════════════════════════════════════════════════════
// 5. Same content in same dedup bucket → same dedup ID
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("sync-batch-5: same cusEntIds produce stable dedup IDs within a bucket")}`,
	async () => {
		const { fn, calls } = createMockQueue();
		const manager = new SyncBatchingManagerV2({
			addTaskToQueueFn: fn,
			batchWindowMs: 30,
			dedupBucketMs: 60_000, // Large bucket so all calls land in the same bucket
		});

		// First batch
		addItems({ manager, count: 5 });
		await wait(80);

		// Second batch (new window, same cusEntIds)
		addItems({ manager, count: 5 });
		await wait(80);

		expect(calls.length).toBe(2);
		expect(calls[0].messageDeduplicationId).toBe(
			calls[1].messageDeduplicationId,
		);
	},
	{ timeout: 5_000 },
);

// ═══════════════════════════════════════════════════════════════════
// 6. Different cusEntIds → different dedup ID
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("sync-batch-6: different cusEntIds produce different dedup IDs")}`,
	async () => {
		const { fn, calls } = createMockQueue();
		const manager = new SyncBatchingManagerV2({
			addTaskToQueueFn: fn,
			batchWindowMs: 30,
			dedupBucketMs: 60_000,
		});

		addItems({ manager, count: 1, cusEntIds: ["ce-1"] });
		await wait(80);

		addItems({ manager, count: 1, cusEntIds: ["ce-2"] });
		await wait(80);

		expect(calls.length).toBe(2);
		expect(calls[0].messageDeduplicationId).not.toBe(
			calls[1].messageDeduplicationId,
		);
	},
	{ timeout: 5_000 },
);

// ═══════════════════════════════════════════════════════════════════
// 7. MAX_BATCH_SIZE triggers immediate flush
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("sync-batch-7: exceeding MAX_BATCH_SIZE triggers immediate flush")}`,
	async () => {
		const { fn, calls } = createMockQueue();
		const manager = new SyncBatchingManagerV2({
			addTaskToQueueFn: fn,
			batchWindowMs: 5000, // Won't fire naturally
		});

		const cusEntIds = Array.from({ length: 1001 }, (_, i) => `ce-${i}`);
		manager.addSyncItem({
			customerId: "cust-1",
			orgId: "org-1",
			env: AppEnv.Sandbox,
			cusEntIds,
			region: "us-east-1",
		});

		await wait(50);
		expect(calls.length).toBe(1);
		expect(calls[0].payload.cusEntIds.length).toBe(1001);
	},
	{ timeout: 5_000 },
);

// ═══════════════════════════════════════════════════════════════════
// 8. flush() drains all pending batches
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("sync-batch-8: flush() drains all pending batches")}`,
	async () => {
		const { fn, calls } = createMockQueue();
		const manager = new SyncBatchingManagerV2({
			addTaskToQueueFn: fn,
			batchWindowMs: 10_000, // Will never fire naturally
		});

		addItems({ manager, count: 3, customerId: "cust-A" });
		addItems({ manager, count: 3, customerId: "cust-B" });

		expect(calls.length).toBe(0);
		await manager.flush();

		expect(calls.length).toBe(2);
		expect(manager.getStats().totalCustomers).toBe(0);
	},
	{ timeout: 5_000 },
);

// ═══════════════════════════════════════════════════════════════════
// 9. 10k burst → bounded number of flushes
// ═══════════════════════════════════════════════════════════════════

test(
	`${chalk.yellowBright("sync-batch-9: 10k rapid items produce bounded flushes")}`,
	async () => {
		const { fn, calls } = createMockQueue();
		const manager = new SyncBatchingManagerV2({
			addTaskToQueueFn: fn,
			batchWindowMs: 100,
		});

		// All 10k items arrive synchronously — faster than the timer can fire
		addItems({ manager, count: 10_000 });

		await wait(300);

		// Fixed window: all items land in a single batch since they arrive
		// before the first timer fires. Should be exactly 1 flush.
		expect(calls.length).toBe(1);
	},
	{ timeout: 5_000 },
);
