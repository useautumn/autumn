import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type LimitedItem } from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const creditsFeature = constructFeatureItem({
	featureId: TestFeature.Credits,
	includedUsage: 200,
}) as LimitedItem;

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [creditsFeature],
});

const testCase = "track-credit-system2";

describe(`${chalk.yellowBright("track-credit-system2: track metered features using credit system")}`, () => {
	const customerId = "track-credit-system2";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const creditFeature = ctx.features.find((f) => f.id === TestFeature.Credits);

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});
	});

	test("should have initial balance of 200 credits", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Credits].balance;

		expect(balance).toBe(200);
	});

	test("should deduct from credits for action1 with credit_cost multiplier", async () => {
		const action1Value = 50.25;
		const expectedCreditCost = getCreditCost({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: action1Value,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: action1Value,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Credits].balance;
		const usage = customer.features[TestFeature.Credits].usage;

		expect(balance).toBe(200 - expectedCreditCost);
		expect(usage).toBe(expectedCreditCost);
	});

	test("should deduct from credits for action2 with different credit_cost", async () => {
		// Get current balance after action1
		const customerBefore = await autumnV1.customers.get(customerId);
		const balanceBefore = customerBefore.features[TestFeature.Credits].balance!;

		const action2Value = 33.67;
		const expectedCreditCost = getCreditCost({
			featureId: TestFeature.Action2,
			creditSystem: creditFeature!,
			amount: action2Value,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: action2Value,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Credits].balance;

		expect(balance).toBe(
			new Decimal(balanceBefore).minus(expectedCreditCost).toNumber(),
		);
	});
});
