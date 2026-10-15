import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	type QueueRefreshEntityAggregatePayload,
	RefreshEntityAggregateBatchingManager,
} from "@/internal/balances/utils/refreshEntityAggregate/RefreshEntityAggregateBatchingManager.js";

const scheduleRefresh = ({
	manager,
}: {
	manager: RefreshEntityAggregateBatchingManager;
}) =>
	manager.schedule({
		orgId: "org_1",
		env: AppEnv.Live,
		customerId: "cus_1",
		internalFeatureIds: ["fe_messages"],
	});

describe("RefreshEntityAggregateBatchingManager flush", () => {
	test("a shutdown flush never reuses the dedup id of a refresh that already fired", async () => {
		let nowMs = 1_000;
		const sent: QueueRefreshEntityAggregatePayload[] = [];
		const manager = new RefreshEntityAggregateBatchingManager({
			addTaskToQueueFn: async (args) => {
				sent.push(args);
			},
			bucketMs: 5_000,
			settleBufferMs: 1_500,
			now: () => nowMs,
		});

		scheduleRefresh({ manager });
		nowMs = 6_500;
		await manager.flush();

		nowMs = 6_800;
		scheduleRefresh({ manager });
		nowMs = 7_000;
		await manager.flush();

		expect(sent).toHaveLength(2);
		expect(sent[1].messageDeduplicationId).not.toBe(
			sent[0].messageDeduplicationId,
		);
	});
});
