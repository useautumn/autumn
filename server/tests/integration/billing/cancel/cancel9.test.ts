import { beforeAll, describe, test } from "bun:test";
import { ApiVersion, CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import {
	expectProductAttached,
	expectProductGroupCount,
} from "@tests/utils/expectUtils/expectProductAttached";

// UNCOMMENT FROM HERE
const premium = constructProduct({
	type: "premium",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

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

const free = constructProduct({
	type: "free",
	isDefault: true,

	items: [],
});

describe(`${chalk.yellowBright("cancel9: Downgrade from premium to pro, then cancel premium immediately (with default product)")}`, () => {
	const customerId = "cancel9";
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
			products: [premium, pro, free],
			prefix: customerId,
		});
	});

	test("should attach premium and pro, then cancel premium immediately (with default product)", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await autumn.cancel({
			customer_id: customerId,
			product_id: premium.id,
			cancel_immediately: true,
		});
	});

	test("should have correct product and subscriptions after cancellation", async () => {
		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer: customer,
			product: free,
			status: CusProductStatus.Active,
		});

		expectProductGroupCount({
			customer: customer,
			group: premium.group!,
			count: 1,
		});

		await expectSubCount({
			ctx,
			customerId,
			count: 0,
		});
	});
});
