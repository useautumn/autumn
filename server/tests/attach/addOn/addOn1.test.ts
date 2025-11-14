import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectFeaturesCorrect } from "../../utils/expectUtils/expectFeaturesCorrect.js";
import { replaceItems } from "../utils.js";

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	type: "pro",
});

export const addOn = constructRawProduct({
	id: "add_on_1",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 200,
		}),
	],
	isAddOn: true,
});

const testCase = "addOn1";

describe(`${chalk.yellowBright(`${testCase}: Testing free add on, and updating free add on`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});
		await initProductsV0({
			ctx,
			products: [pro, addOn],
			prefix: testCase,
		});
	});

	test("should should attach pro product, then add on product", async () => {
		await attachAndExpectCorrect({
			autumn,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			stripeCli: ctx.stripeCli,
			customerId,
			product: pro,
		});
	});

	test("should should attach add on product", async () => {
		const preview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: addOn.id,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: addOn.id,
		});

		const customer = await autumn.customers.get(customerId);

		expect(customer.products.length).toBe(2);
		expectProductAttached({
			customer,
			product: addOn,
		});
		expectProductAttached({
			customer,
			product: pro,
		});
	});

	const customItems = replaceItems({
		items: addOn.items,
		featureId: TestFeature.Messages,
		newItem: constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 400,
		}),
	});

	test("should update add on product", async () => {
		const preview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: addOn.id,
			is_custom: true,
			items: customItems,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: addOn.id,
			is_custom: true,
			items: customItems,
		});

		const customer = await autumn.customers.get(customerId);

		expect(customer.products.length).toBe(2);
		expectProductAttached({
			customer,
			product: addOn,
		});

		expectFeaturesCorrect({
			customer,
			product: {
				...addOn,
				items: customItems,
			},
			otherProducts: [pro],
		});
	});
});
