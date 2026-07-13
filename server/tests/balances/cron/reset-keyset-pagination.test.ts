import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	customerEntitlements,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { findCustomerEntitlement } from "../utils/findCustomerEntitlement";

describe(`${chalk.yellowBright("reset-keyset-pagination: getActiveResetPassed pages deterministically")}`, () => {
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
	const customerIds = Array.from({ length: 8 }, (_, i) => `keyset-pg-${i}`);
	const seededCusEntIds: string[] = [];

	beforeAll(async () => {
		const now = Date.now();

		for (const [i, customerId] of customerIds.entries()) {
			await initCustomerV3({ ctx, customerId, withTestClock: false });

			await autumnV1.balances.create({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				granted_balance: 100,
				reset: { interval: ResetInterval.Month },
			});

			const cusEnt = await findCustomerEntitlement({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			});
			expect(cusEnt).toBeDefined();

			await ctx.db
				.update(customerEntitlements)
				.set({ next_reset_at: now - 60_000 - i * 1000 })
				.where(eq(customerEntitlements.id, cusEnt!.id));

			seededCusEntIds.push(cusEnt!.id);
		}
	});

	test("multi-page fetch returns every due candidate exactly once", async () => {
		const results = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			batchSize: 3,
			limit: 100_000,
		});

		const returnedSeeded = results
			.map((ce) => ce.id)
			.filter((id) => seededCusEntIds.includes(id));

		expect(returnedSeeded.length).toBe(seededCusEntIds.length);
		expect(new Set(returnedSeeded).size).toBe(seededCusEntIds.length);
	});

	test("results are ordered by (next_reset_at, id) across pages", async () => {
		const results = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			batchSize: 3,
			limit: 100_000,
		});

		expect(results.length).toBeGreaterThanOrEqual(seededCusEntIds.length);

		for (let i = 1; i < results.length; i++) {
			const prev = results[i - 1];
			const curr = results[i];
			const prevKey = Number(prev.next_reset_at);
			const currKey = Number(curr.next_reset_at);
			const ordered =
				prevKey < currKey || (prevKey === currKey && prev.id <= curr.id);
			expect(ordered).toBe(true);
		}
	});

	test("limit stops fetching at the page boundary", async () => {
		const results = await CusEntService.getActiveResetPassed({
			db: ctx.db,
			batchSize: 3,
			limit: 4,
		});

		expect(results.length).toBeGreaterThanOrEqual(4);
		expect(results.length).toBeLessThanOrEqual(6);
	});
});
