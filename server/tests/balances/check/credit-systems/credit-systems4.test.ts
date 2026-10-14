import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV1, SuccessCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const creditsFeature = constructFeatureItem({
	featureId: TestFeature.Credits,
	includedUsage: 1000,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [creditsFeature],
});

const testCase = "credit-systems4";
const customerId = "credit-systems4";

describe(`${chalk.yellowBright("credit-systems4: test send_event with credit system")}`, () => {
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

	test("should deduct credits correctly when using send_event with decimal value", async () => {
		const requiredAction1Units = 25.75;

		const expectedCreditCost = featureToCreditSystem({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: requiredAction1Units,
		});

		const checkRes = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: requiredAction1Units,
			send_event: true,
		})) as unknown as CheckResponseV1;

		expect(checkRes.allowed).toBe(true);
		expect(checkRes.feature_id).toBe(TestFeature.Credits);
		expect(checkRes.balance).toBe(1000 - expectedCreditCost);
		expect(checkRes.code).toBe(SuccessCode.FeatureFound);

		await timeout(2000);

		const customer: any = await autumnV1.customers.get(customerId);
		const creditsBalance = customer.features[TestFeature.Credits].balance;
		const creditsUsage = customer.features[TestFeature.Credits].usage;

		expect(creditsBalance).toBe(1000 - expectedCreditCost);
		expect(creditsUsage).toBe(expectedCreditCost);
	});
	return;

	test("should handle multiple send_event calls with different decimal values", async () => {
		const customerBefore: any = await autumnV1.customers.get(customerId);
		const balanceBefore = customerBefore.features[TestFeature.Credits].balance;

		const requiredAction1Units = 10.5;
		const creditCost1 = featureToCreditSystem({
			featureId: TestFeature.Action1,
			creditSystem: creditFeature!,
			amount: requiredAction1Units,
		});

		await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: requiredAction1Units,
			send_event: true,
		});

		const requiredAction2Units = 15.25;
		const creditCost2 = featureToCreditSystem({
			featureId: TestFeature.Action2,
			creditSystem: creditFeature!,
			amount: requiredAction2Units,
		});

		await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			required_balance: requiredAction2Units,
			send_event: true,
		});

		await timeout(2000);

		const customerAfter: any = await autumnV1.customers.get(customerId);
		const balanceAfter = customerAfter.features[TestFeature.Credits].balance;
		const totalExpectedCost = creditCost1 + creditCost2;

		expect(balanceAfter).toBe(balanceBefore - totalExpectedCost);
		expect(customerAfter.features[TestFeature.Credits].usage).toBe(
			customerBefore.features[TestFeature.Credits].usage + totalExpectedCost,
		);
	});

	test("should not deduct credits when check fails due to insufficient balance", async () => {
		const customerBefore: any = await autumnV1.customers.get(customerId);
		const balanceBefore = customerBefore.features[TestFeature.Credits].balance;

		const requiredAction1Units = 10000;
		const checkRes = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: requiredAction1Units,
			send_event: true,
		})) as unknown as CheckResponseV1;

		expect(checkRes.allowed).toBe(false);

		await timeout(2000);

		const customerAfter: any = await autumnV1.customers.get(customerId);
		expect(customerAfter.features[TestFeature.Credits].balance).toBe(
			balanceBefore,
		);
	});
});
