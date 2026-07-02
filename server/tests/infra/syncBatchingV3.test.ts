import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	type QueueSyncV4Payload,
	SyncBatchingManagerV3,
} from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";

const createMockQueue = () => {
	const calls: QueueSyncV4Payload[] = [];
	const fn = async (args: QueueSyncV4Payload) => {
		calls.push(structuredClone(args));
	};
	return { fn, calls };
};

test("sync-batch-v3: queues sync-v4 with stable customer group and deduped modified ids", async () => {
	const { fn, calls } = createMockQueue();
	const manager = new SyncBatchingManagerV3({
		addTaskToQueueFn: fn,
		batchWindowMs: 10_000,
	});

	manager.addSyncItem({
		customerId: "cust-1",
		orgId: "org-1",
		env: AppEnv.Sandbox,
		cusEntIds: ["ce-1"],
		region: "us-east-1",
		modifiedCusEntIdsByFeatureId: {
			feature_1: ["ce-1", "ce-1", "ce-2"],
		},
	});

	await manager.flush();

	expect(calls).toHaveLength(1);
	expect(calls[0].messageGroupId).toBe("sync-v4:org-1:sandbox:cust-1");
	expect(calls[0].payload.modifiedCusEntIdsByFeatureId).toEqual({
		feature_1: ["ce-1", "ce-2"],
	});
});
