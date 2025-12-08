import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubToBeCorrect } from "../../../merged/mergeUtils/expectSubCorrect";
import {
	expectProductAttached,
	expectProductNotAttached,
} from "../../../utils/expectUtils/expectProductAttached";
import { timeout } from "../../../utils/genUtils";

const pro = constructProduct({
	type: "pro",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 0,
		}),
	],
});
const monthlyAddOn = constructProduct({
	id: "monthlyAddOn",
	type: "pro",
	isAddOn: true,
	items: [
		constructArrearItem({
			featureId: TestFeature.Messages,
			includedUsage: 0,
			billingUnits: 1,
			price: 0.5,
		}),
	],
});

describe(`${chalk.yellowBright("cancel-addon3: Attach pro + usage add on, use overage, then cancel usage add on immediately")}`, () => {
	const customerId = "cancel-addon3";
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

	test("should attach pro and monthly add on, then cancel monthly add on immediately", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: monthlyAddOn.id,
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1000,
		});

		await timeout(3000);

		await autumn.cancel({
			customer_id: customerId,
			product_id: monthlyAddOn.id,
			cancel_immediately: true,
		});

		const customer = await autumn.customers.get(customerId);
		expectProductAttached({
			customer,
			product: pro,
			status: CusProductStatus.Active,
		});

		expectProductNotAttached({
			customer,
			product: monthlyAddOn,
		});

		// 1. Subs should be correct
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			shouldBeCanceled: false,
		});

		expect(customer.invoices?.[0]?.total).toBe(500 - 20);
	});
});
