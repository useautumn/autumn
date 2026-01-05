import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type CheckResponseV2,
	ProductItemInterval,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test: update-filters5
 *
 * Tests filtering balance updates by interval with multiple products per interval.
 *
 * Scenario:
 * - Product A: Monthly messages (100)
 * - Product B: Monthly messages (150)
 * - Product C: Lifetime messages (200)
 * - Product D: Lifetime messages (50)
 *
 * Update by interval should sequentially distribute across breakdowns of that interval.
 */

const monthlyMessagesA = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
});

const monthlyMessagesB = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 150,
	interval: ProductItemInterval.Month,
});

const lifetimeMessagesC = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 200,
	interval: null,
});

const lifetimeMessagesD = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	interval: null,
});

const monthlyProdA = constructProduct({
	type: "free",
	id: "monthly-prod-a",
	isDefault: false,
	items: [monthlyMessagesA],
});

const monthlyProdB = constructProduct({
	type: "free",
	id: "monthly-prod-b",
	isDefault: false,
	isAddOn: true,
	items: [monthlyMessagesB],
});

const lifetimeProdC = constructProduct({
	type: "free",
	id: "lifetime-prod-c",
	isDefault: false,
	isAddOn: true,
	items: [lifetimeMessagesC],
});

const lifetimeProdD = constructProduct({
	type: "free",
	id: "lifetime-prod-d",
	isDefault: false,
	isAddOn: true,
	items: [lifetimeMessagesD],
});

const testCase = "update-filters5";

describe(`${chalk.yellowBright("update-filters5: interval filter with multiple products, sequential deduction")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [monthlyProdA, monthlyProdB, lifetimeProdC, lifetimeProdD],
			prefix: testCase,
		});

		await autumnV2.attach({
			customer_id: customerId,
			product_id: monthlyProdA.id,
		});
		await autumnV2.attach({
			customer_id: customerId,
			product_id: monthlyProdB.id,
		});
		await autumnV2.attach({
			customer_id: customerId,
			product_id: lifetimeProdC.id,
		});
		await autumnV2.attach({
			customer_id: customerId,
			product_id: lifetimeProdD.id,
		});
	});

	test("initial: customer has 500 with 2 monthly (250) and 2 lifetime (250)", async () => {
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 500,
			current_balance: 500,
			usage: 0,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(res.balance?.breakdown).toHaveLength(4);

		// Monthly breakdowns
		const monthlyBreakdowns =
			res.balance?.breakdown?.filter((b) => b.reset?.interval === "month") ??
			[];
		expect(monthlyBreakdowns).toHaveLength(2);
		const monthlySum = monthlyBreakdowns.reduce(
			(s, b) => s + (b.granted_balance ?? 0),
			0,
		);
		expect(monthlySum).toBe(250);

		// Lifetime breakdowns
		const lifetimeBreakdowns =
			res.balance?.breakdown?.filter((b) => b.reset?.interval === "one_off") ??
			[];
		expect(lifetimeBreakdowns).toHaveLength(2);
		const lifetimeSum = lifetimeBreakdowns.reduce(
			(s, b) => s + (b.granted_balance ?? 0),
			0,
		);
		expect(lifetimeSum).toBe(250);
	});

	test("decrease monthly balance from 250 to 150 (sequential deduction of 100)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 150,
			interval: ResetInterval.Month,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 400 (150 monthly + 250 lifetime)
		expect(res.balance).toMatchObject({
			granted_balance: 400,
			current_balance: 400,
			usage: 0,
		});

		// Monthly breakdowns: one deducted, one unchanged
		const monthlyBreakdowns =
			res.balance?.breakdown?.filter((b) => b.reset?.interval === "month") ??
			[];
		expect(monthlyBreakdowns).toHaveLength(2);

		const monthlySum = monthlyBreakdowns.reduce(
			(s, b) => s + (b.current_balance ?? 0),
			0,
		);
		expect(monthlySum).toBe(150);

		// Lifetime should be unchanged
		const lifetimeBreakdowns =
			res.balance?.breakdown?.filter((b) => b.reset?.interval === "one_off") ??
			[];
		const lifetimeSum = lifetimeBreakdowns.reduce(
			(s, b) => s + (b.current_balance ?? 0),
			0,
		);
		expect(lifetimeSum).toBe(250);
	});

	test("decrease monthly balance from 150 to 50 (sequential deduction of 100, spans both)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 50,
			interval: ResetInterval.Month,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 300 (50 monthly + 250 lifetime)
		expect(res.balance).toMatchObject({
			granted_balance: 300,
			current_balance: 300,
			usage: 0,
		});

		// Monthly breakdowns should sum to 50
		const monthlyBreakdowns =
			res.balance?.breakdown?.filter((b) => b.reset?.interval === "month") ??
			[];
		const monthlySum = monthlyBreakdowns.reduce(
			(s, b) => s + (b.current_balance ?? 0),
			0,
		);
		expect(monthlySum).toBe(50);
	});

	test("decrease lifetime balance from 250 to 100 (sequential deduction of 150)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 100,
			interval: ResetInterval.OneOff,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 150 (50 monthly + 100 lifetime)
		expect(res.balance).toMatchObject({
			granted_balance: 150,
			current_balance: 150,
			usage: 0,
		});

		// Lifetime breakdowns should sum to 100
		const lifetimeBreakdowns =
			res.balance?.breakdown?.filter((b) => b.reset?.interval === "one_off") ??
			[];
		const lifetimeSum = lifetimeBreakdowns.reduce(
			(s, b) => s + (b.current_balance ?? 0),
			0,
		);
		expect(lifetimeSum).toBe(100);
	});

	test("increase monthly balance from 50 to 200 (sequential addition of 150)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 200,
			interval: ResetInterval.Month,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 300 (200 monthly + 100 lifetime)
		expect(res.balance).toMatchObject({
			granted_balance: 300,
			current_balance: 300,
			usage: 0,
		});

		// Monthly breakdowns should sum to 200
		const monthlyBreakdowns =
			res.balance?.breakdown?.filter((b) => b.reset?.interval === "month") ??
			[];
		const monthlySum = monthlyBreakdowns.reduce(
			(s, b) => s + (b.current_balance ?? 0),
			0,
		);
		expect(monthlySum).toBe(200);
	});

	test("increase lifetime balance from 100 to 350 (sequential addition of 250)", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			current_balance: 350,
			interval: ResetInterval.OneOff,
		});

		const res = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Total should be 550 (200 monthly + 350 lifetime)
		expect(res.balance).toMatchObject({
			granted_balance: 550,
			current_balance: 550,
			usage: 0,
		});

		// Lifetime breakdowns should sum to 350
		const lifetimeBreakdowns =
			res.balance?.breakdown?.filter((b) => b.reset?.interval === "one_off") ??
			[];
		const lifetimeSum = lifetimeBreakdowns.reduce(
			(s, b) => s + (b.current_balance ?? 0),
			0,
		);
		expect(lifetimeSum).toBe(350);
	});

	test("verify database state matches cache", async () => {
		// Wait for database sync
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const customerFromDb = await autumnV2.customers.get<ApiCustomer>(
			customerId,
			{ skip_cache: "true" },
		);

		expect(customerFromDb.balances[TestFeature.Messages]).toMatchObject({
			granted_balance: 550,
			current_balance: 550,
			usage: 0,
		});
	});
});
