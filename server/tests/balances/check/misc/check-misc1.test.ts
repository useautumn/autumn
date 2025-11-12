import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion, type LimitedItem } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const creditCost = 0.2;
const freeProduct = constructProduct({
	id: "free",
	items: [constructFeatureItem({ featureId: TestFeature.Action1 })],
	type: "free",
	isDefault: false,
});

const creditFeatureItem = constructFeatureItem({
	featureId: TestFeature.Credits,
}) as LimitedItem;
const pro = constructProduct({
	id: "pro",
	items: [creditFeatureItem],
	type: "pro",
});

const testCase = "check-misc1";
describe(`${chalk.yellowBright("check-misc1: Checking credit systems")}`, () => {
	const customerId = testCase;

	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [freeProduct, pro],
			prefix: testCase,
		});
	});

	test("should attach free product and check action1 allowed", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: freeProduct.id,
		});

		const actionCheck = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
		});

		const creditsCheck = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		});

		expect(actionCheck.allowed).toBe(true);
		expect(creditsCheck.allowed).toBe(false);
	});

	test("should attach pro product and check allowed", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const creditsCheck = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		});

		const actionCheck = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
		});

		expect(actionCheck.allowed).toBe(true);
		expect(creditsCheck.allowed).toBe(true);
	});

	test("should use up credits and have correct check response", async () => {
		const usage = 50;
		const creditUsage = new Decimal(creditCost).mul(usage).toNumber();

		const creditBalance = new Decimal(creditFeatureItem.included_usage)
			.sub(creditUsage)
			.toNumber();

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: usage,
		});

		await timeout(3000);

		const creditsCheck = await autumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
		});

		expect(creditsCheck.balance).toBe(creditBalance);
	});
});
