import { beforeAll, describe, test } from "bun:test";
import { ApiVersion, BillingInterval, FreeTrialDuration } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils";
import {
	constructArrearItem,
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { CusService } from "../../src/internal/customers/CusService";

const paidAddOn = constructRawProduct({
	id: "addOn",
	isAddOn: true,
	items: [
		constructPriceItem({
			price: 10,
			interval: BillingInterval.Month,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 500,
		}),
	],
});

const pro = constructProduct({
	type: "pro",

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 300,
		}),
	],
});

const testCase = "temp";

describe(`${chalk.yellowBright("temp: temporary script for testing")}`, () => {
	const customerId = "temp";
	const autumnV0: AutumnInt = new AutumnInt({ version: ApiVersion.V0_2 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await CusService.deleteByOrgId({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const result = await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro, paidAddOn],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: result.testClockId,
			advanceTo: addWeeks(new Date(), 3).getTime(),
			waitForSeconds: 10,
		});
	});
});
