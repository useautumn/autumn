import { beforeAll, describe } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { toUnix } from "@tests/utils/testIntervalUtils/testUnixUtils";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { advanceTestClock } from "../../src/utils/scriptUtils/testClockUtils";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0";

const freeProd = constructProduct({
	type: "free",
	isDefault: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 500,
		}),
	],
});

const proProd = constructProduct({
	type: "pro",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 300,
		}),
	],
	intervalCount: 2,
});

const premium = constructProduct({
	type: "premium",
	isDefault: false,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		}),
	],
});
const freeAddOn = constructRawProduct({
	id: "freeAddOn",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 1000,
		}),
	],
	isAddOn: true,
});

const oneOffAddOn = constructRawProduct({
	id: "oneOffAddOn",
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			billingUnits: 100,
			price: 10,
			isOneOff: true,
		}),
	],
	isAddOn: true,
});

const monthlyAddOn = constructRawProduct({
	id: "monthlyAddOn",
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			billingUnits: 100,
			price: 10,
		}),
	],
	isAddOn: true,
});

const testCase = "temp";

describe(`${chalk.yellowBright("temp: temporary script for testing")}`, () => {
	const customerId = "temp";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		const result = await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [freeProd, proProd, premium, freeAddOn, monthlyAddOn],
			prefix: customerId,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: freeAddOn.id,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: proProd.id,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: monthlyAddOn.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 100,
				},
			],
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: result.testClockId,
			advanceTo: toUnix({
				year: 2026,
				month: 1,
				day: 15,
			}),
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: proProd.id,
		});
	});
	return;
});
