import { beforeAll, describe } from "bun:test";
import {
	ApiVersion,
	CouponDurationType,
	type CreateReward,
	RewardType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { createReward } from "@tests/utils/productUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructArrearProratedItem,
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import {
	constructProduct,
	constructRawProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
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

const pro = constructProduct({
	type: "pro",
	isDefault: false,
	items: [
		constructArrearProratedItem({
			featureId: TestFeature.Users,
			includedUsage: 1,
			pricePerUnit: 10,
		}),
		constructArrearProratedItem({
			featureId: TestFeature.Workflows,
			includedUsage: 1,
			pricePerUnit: 25,
		}),
		constructArrearItem({
			featureId: TestFeature.Words,
			billingUnits: 1,
			price: 0.1,
		}),
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			billingUnits: 100,
			price: 8,
		}),
	],
	// intervalCount: 2,
});

const premium = constructProduct({
	type: "premium",
	isDefault: false,
	items: [
		constructArrearItem({
			featureId: TestFeature.Words,
			billingUnits: 1,
			price: 0.1,
		}),

		constructArrearProratedItem({
			featureId: TestFeature.Users,
			includedUsage: 1,
			pricePerUnit: 15,
		}),
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			billingUnits: 100,
			price: 12,
		}),
	],
	// intervalCount: 2,
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

const entities = [
	{
		id: "entity1",
		feature_id: TestFeature.Users,
	},
	{
		id: "entity2",
		feature_id: TestFeature.Users,
	},
];

// 50% off reward that only applies to pro product
const rewardId = "50_percent_off";
const promoCode = "50OFF";
const reward: CreateReward = {
	id: rewardId,
	name: "50% Off Pro",
	type: RewardType.PercentageDiscount,
	promo_codes: [{ code: promoCode }],
	discount_config: {
		discount_value: 50, // 50% off
		duration_type: CouponDurationType.Forever,
		duration_value: 0,
		should_rollover: false,
		apply_to_all: false, // Only applies to specific product
		price_ids: [], // Will be populated when creating reward with productId
	},
};

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
			products: [freeProd, pro, premium, freeAddOn, monthlyAddOn],
			prefix: customerId,
		});

		await createReward({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			autumn: autumnV1,
			reward,
			// productId: pro.id,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 300,
				},
			],
			// reward: rewardId,
		});

		await autumnV1.entities.create(customerId, entities);

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Workflows,
			value: 4,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: 1000,
		});

		// const customer = await CusService.getFull({
		// 	db: ctx.db,
		// 	idOrInternalId: customerId,
		// 	orgId: ctx.org.id,
		// 	env: ctx.env,
		// });

		// await attachFailedPaymentMethod({
		// 	stripeCli: ctx.stripeCli,
		// 	customer,
		// });

		// await advanceTestClock({
		// 	stripeCli: ctx.stripeCli,
		// 	testClockId: result.testClockId,
		// 	advanceTo: toUnix({
		// 		year: 2025,
		// 		month: 12,
		// 		day: 22,
		// 	}),
		// });
	});
	return;
});
