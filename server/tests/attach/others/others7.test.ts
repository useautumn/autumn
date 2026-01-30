import { beforeAll, describe, expect, test } from "bun:test";
import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAttachCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { getBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import chalk from "chalk";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

export const pro = constructProduct({
	items: [constructArrearItem({ featureId: TestFeature.Words })],
	type: "pro",
	trial: true,
});

const testCase = "others7";

describe(`${chalk.yellowBright(`${testCase}: Testing attach with free_trial=False`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: { fingerprint: "test" },
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});
	});

	test("should attach pro product with free_trial=False", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			free_trial: false,
		});

		const customer = await autumn.customers.get(customerId);

		expectAttachCorrect({
			customer,
			product: pro,
		});

		expect(customer.invoices.length).toBe(1);
		expect(customer.invoices[0].total).toBe(getBasePrice({ product: pro }));
	});
});
