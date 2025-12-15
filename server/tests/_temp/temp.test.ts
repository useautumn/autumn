import { beforeAll, describe } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
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
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { CusService } from "../../src/internal/customers/CusService";

const paidAddOn = constructRawProduct({
	id: "addOn",
	isAddOn: true,
	items: [
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
			includedUsage: 100,
		}),
		constructFeatureItem({
			featureId: TestFeature.Workflows,
			includedUsage: 10,
		}),
	],
	trial: true,
});
const premium = constructProduct({
	type: "premium",

	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			price: 12,
			billingUnits: 100,
		}),
	],
});

const testCase = "temp";

describe(`${chalk.yellowBright("temp: temporary script for testing")}`, () => {
	const customerId = "temp";

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
			products: [pro, premium],
			prefix: testCase,
		});

		// const entities = [
		// 	{
		// 		id: "1",
		// 		name: "Entity 1",
		// 		feature_id: TestFeature.Users,
		// 	},
		// 	{
		// 		id: "2",
		// 		name: "Entity 2",
		// 		feature_id: TestFeature.Users,
		// 	},
		// ];

		// await autumnV1.entities.create(customerId, entities);
		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			// entity_id: entities[0].id,
		});

		// await autumnV1.attach({
		// 	customer_id: customerId,
		// 	product_id: pro.id,
		// 	entity_id: entities[1].id,
		// });

		console.log(res);

		// await autumnV1.attach({ customer_id: customerId, product_id: premium.id });
	});
});
