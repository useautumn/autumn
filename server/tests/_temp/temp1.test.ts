import { beforeAll, describe } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "../../src/utils/scriptUtils/constructItem.js";
import { initCustomerV3 } from "../../src/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "../../src/utils/scriptUtils/testUtils/initProductsV0.js";

const free = constructProduct({
	type: "free",
	isDefault: false,

	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 5,
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

export const premium = constructProduct({
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

const entity = {
	id: "entity1",
	name: "Entity 1",
	feature_id: TestFeature.Messages,
};

describe(`${chalk.yellowBright("temp1: Testing pro product")}`, () => {
	const customerId = "temp1";
	const autumn: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [free, pro, premium],
			prefix: customerId,
			// customerId,
		});

		await autumn.entities.create(customerId, [entity]);

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entity.id,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
			entity_id: entity.id,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entity.id,
		});
	});
});
