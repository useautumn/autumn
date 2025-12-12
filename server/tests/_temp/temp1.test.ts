import { beforeAll, describe } from "bun:test";
import { ApiVersion, FreeTrialDuration } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "../../src/utils/scriptUtils/constructItem.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";

const pro = constructProduct({
	type: "free",
	isDefault: false,
	forcePaidDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 5,
		}),
	],
});

const oneOff = constructRawProduct({
	id: "one_off",
	isAddOn: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 10,
			interval: null,
		}),
	],
});

describe(`${chalk.yellowBright("temp: Testing entity prorated")}`, () => {
	const customerId = "temp";
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro, oneOff],
			prefix: customerId,
			customerId,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: oneOff.id,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});
});
