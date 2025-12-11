import { beforeAll, describe, test } from "bun:test";
import { ApiVersion, BillingInterval, FreeTrialDuration } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
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

const freeProd = constructRawProduct({
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

export const defaultTrialProduct = constructProduct({
	type: "pro",
	forcePaidDefault: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 300,
		}),
	],

	freeTrial: {
		length: 7,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: false,
		card_required: false,
	},
});

const entity = {
	id: "entity",
	name: "Entity",
	feature_id: TestFeature.Users,
};

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

		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [freeProd, defaultTrialProduct],
			prefix: testCase,
		});
	});
});
