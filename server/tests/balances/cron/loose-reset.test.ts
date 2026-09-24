import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	customerEntitlements,
	ResetInterval,
	sleepUntil,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import {
	findResetEligibleRow,
	runResetOnCustomerEntitlement,
} from "@tests/utils/cusProductUtils/resetTestUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { findCustomerEntitlement } from "../utils/findCustomerEntitlement";

describe(`${chalk.yellowBright("loose-reset: the V2 reset scan and reset for loose entitlements")}`, () => {
	const customerId = "loose-reset-test";
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2 = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		// Create a monthly loose entitlement
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 100,
			reset: {
				interval: ResetInterval.Month,
			},
		});
	});

	test("the reset scan selects a loose entitlement with past next_reset_at", async () => {
		const looseCusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(looseCusEnt).toBeDefined();

		// 2. Update next_reset_at to be in the past
		const pastTime = Date.now() - 1000; // 1 second ago
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: pastTime })
			.where(eq(customerEntitlements.id, looseCusEnt!.id));

		// 3. The V2 scan selects it, as a loose row (no plan)
		const eligible = await findResetEligibleRow({
			ctx,
			customerEntitlementId: looseCusEnt!.id,
		});
		expect(eligible).not.toBeNull();
		expect(eligible?.customerProductId).toBeNull();
	});

	test("the V2 reset refills a loose entitlement", async () => {
		// 1. Track 50 usage (leaving balance at 50)
		const trackRes = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});

		expect(trackRes?.balance).toMatchObject({
			granted_balance: 100,
			current_balance: 50,
			usage: 50,
		});

		// Wait for sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});

		const cusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			fullCustomer,
		});

		// 3. One reset cycle through the V2 cron's lane
		await runResetOnCustomerEntitlement({
			ctx,
			customerId,
			customerEntitlementId: cusEnt!.id,
		});

		// 4. Verify balance has reset to granted_balance (100)
		const customer = (await autumnV2.customers.get(customerId, {
			skip_cache: "true",
		})) as unknown as ApiCustomer;

		expect(customer.balances[TestFeature.Messages].current_balance).toBe(100);
		expect(customer.balances[TestFeature.Messages].usage).toBe(0);
	});
});

describe(`${chalk.yellowBright("loose-reset: expired entitlements should not be fetched")}`, () => {
	const customerId = "loose-reset-expiry-test";
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});
	});

	test("the reset scan skips an expired loose entitlement", async () => {
		// 1. Create a balance with expires_at 3 seconds from now
		const expiresAt = Date.now() + 3000;
		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			granted_balance: 100,
			reset: {
				interval: ResetInterval.Month,
			},
			expires_at: expiresAt,
		});

		// Get the cusEnt and set next_reset_at to past (so it would be due for reset)
		const cusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(cusEnt).toBeDefined();

		const pastTime = Date.now() - 1000;
		await ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: pastTime })
			.where(eq(customerEntitlements.id, cusEnt!.id));

		// 2. Wait until past expiry
		await sleepUntil(expiresAt + 1000);

		// 3. The V2 scan leaves the expired row out
		expect(
			await findResetEligibleRow({ ctx, customerEntitlementId: cusEnt!.id }),
		).toBeNull();
	});
});
