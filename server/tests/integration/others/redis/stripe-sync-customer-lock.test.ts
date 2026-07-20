import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { withStripeSyncCustomerLock } from "@/internal/billing/v2/actions/sync/utils/withStripeSyncCustomerLock.js";
import { timeout } from "@/utils/genUtils.js";

const describeWithRedis = process.env.TESTS_ORG ? describe : describe.skip;

describeWithRedis("stripe sync customer lock", () => {
	test("renews ownership while a sync exceeds the base TTL", async () => {
		const customerId = `stripe-sync-lock-${randomUUID()}`;
		const leaseMs = 100;
		let active = 0;
		let maxActive = 0;

		const run = async ({ durationMs }: { durationMs: number }) => {
			active++;
			maxActive = Math.max(maxActive, active);
			await timeout(durationMs);
			active--;
		};

		const first = withStripeSyncCustomerLock({
			ctx,
			customerId,
			leaseMs,
			maxWaitMs: 500,
			run: () => run({ durationMs: 150 }),
		});
		await timeout(20);
		const follower = withStripeSyncCustomerLock({
			ctx,
			customerId,
			leaseMs,
			maxWaitMs: 500,
			run: () => run({ durationMs: 20 }),
		});

		await Promise.all([first, follower]);
		expect(maxActive).toBe(1);
	});
});
