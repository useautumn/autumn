import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { withStripeSyncCustomerLock } from "@/internal/billing/v2/actions/sync/utils/withStripeSyncCustomerLock.js";
import { timeout } from "@/utils/genUtils.js";

const describeWithRedis = process.env.TESTS_ORG ? describe : describe.skip;

describeWithRedis("stripe sync customer lock", () => {
	test("serializes customer syncs", async () => {
		const customerId = `stripe-sync-lock-${randomUUID()}`;
		let active = 0;
		let maxActive = 0;

		const run = async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			await timeout(100);
			active--;
		};

		await Promise.all([
			withStripeSyncCustomerLock({ ctx, customerId, run }),
			withStripeSyncCustomerLock({ ctx, customerId, run }),
		]);
		expect(maxActive).toBe(1);
	});
});
