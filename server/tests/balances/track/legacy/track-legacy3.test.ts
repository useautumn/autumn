import { beforeAll, describe, test } from "bun:test";
import { ApiVersion, ProductItemInterval } from "@autumn/shared";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "../../../../src/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "../../../../src/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "../../../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../../../src/utils/scriptUtils/testUtils/initProductsV0.js";
import { AutumnCli } from "../../../cli/AutumnCli.js";
import { TestFeature } from "../../../setup/v2Features.js";
import { checkEntitledOnProduct } from "./trackLegacyUtils.js";

const testCase = "trackLegacy3";

// Pro product - matches global products.pro
const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Dashboard,
			isBoolean: true,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 10,
			interval: ProductItemInterval.Month,
		}),
		constructFeatureItem({
			featureId: TestFeature.Admin,
			unlimited: true,
		}),
	],
});

// One-time add-on product - matches global products.oneTimeAddOnMetered1
const oneTimeAddOnMetered1 = constructRawProduct({
	id: "one-time-add-on-metered-1",
	isAddOn: true,
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			isOneOff: true,
			billingUnits: 100,
			includedUsage: 0,
		}),
	],
});

describe(`${chalk.yellowBright(
	"trackLegacy3: Testing /events and /entitled, for pro, one time top up",
)}`, () => {
	const customerId = testCase;

	let curAllowance = 0;
	const oneTimeBillingUnits = 100; // From oneTimeAddOnMetered1 prepaid item
	const oneTimeQuantity = 2 * oneTimeBillingUnits;
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro, oneTimeAddOnMetered1],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});
	});

	test("should attach pro", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: pro.id,
		});

		await autumn.customers.get(customerId); // set cache
	});

	test("should have correct entitlements (pro)", async () => {
		const used = await checkEntitledOnProduct({
			customerId: customerId,
			product: pro,
			finish: false,
		});

		const messagesItem = pro.items.find(
			(item) => item.feature_id === TestFeature.Messages,
		);
		const proAllowance =
			messagesItem?.included_usage &&
			typeof messagesItem.included_usage === "number"
				? messagesItem.included_usage
				: 0;
		curAllowance = proAllowance - used;
	});

	test("should attach one time top up", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: oneTimeAddOnMetered1.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: oneTimeQuantity,
				},
			],
		});

		await autumn.customers.get(customerId); // set cache
	});

	test("should have correct entitlements (one time top up)", async () => {
		// const oneTimeAmt = oneTimeBillingUnits * oneTimeQuantity;

		await checkEntitledOnProduct({
			customerId: customerId,
			product: oneTimeAddOnMetered1,
			finish: true,
			totalAllowance: curAllowance + oneTimeQuantity,
			timeoutMs: 15000,
		});
	});
});
