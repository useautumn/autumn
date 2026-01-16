import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { timeout } from "@tests/utils/genUtils.js";

const pro = constructProduct({
	type: "pro",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 50,
		}),
	],
});
const monthlyAddOn = constructProduct({
	id: "monthlyAddOn",
	type: "pro",
	isAddOn: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 300,
		}),
	],
});

describe(`${chalk.yellowBright("renew-addon1: Attach pro + monthly add on, cancel monthly add on end of cycle, then renew")}`, () => {
	const customerId = "renew-addon1";
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

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
			products: [pro, monthlyAddOn],
			prefix: customerId,
		});
	});

	test("should attach pro and monthly add on, cancel monthly add on end of cycle, then renew monthly add on", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: monthlyAddOn.id,
		});

		await autumn.cancel({
			customer_id: customerId,
			product_id: monthlyAddOn.id,
			cancel_immediately: false,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: monthlyAddOn.id,
		});

		await timeout(4000);

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
			status: CusProductStatus.Active,
		});
		expectProductAttached({
			customer,
			product: monthlyAddOn,
			status: CusProductStatus.Active,
		});

		const monthlyAddOnProduct = customer.products.find(
			(p) => p.id === monthlyAddOn.id,
		);

		console.log("monthlyAddOnProduct", monthlyAddOnProduct);
		expect(monthlyAddOnProduct?.canceled_at).toBeNull();

		// 1. Subs should be correct
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: false,
		});
	});
});
