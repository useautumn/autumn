import { beforeAll, describe, test } from "bun:test";
import chalk from "chalk";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/* 
FLOW:
1. Attach pro group 1 & pro group 2 at once -> should have both products as main
2. Upgrade pro group 1 -> premium group 1
3. Upgrade pro group 2 -> premium group 2
*/

const testCase = "multiProduct1";

// Group 1 products (use Messages feature)
const proGroup1 = constructProduct({
	id: "proGroup1",
	group: `${testCase}-g1`,
	type: "pro",
	items: [
		constructArrearItem({
			includedUsage: 10,
			featureId: TestFeature.Messages,
			price: 100, // $1.00 per unit (100 cents per billing unit of 1)
			billingUnits: 1,
		}),
	],
});

const premiumGroup1 = constructProduct({
	id: "premiumGroup1",
	group: `${testCase}-g1`,
	type: "premium",
	items: [
		constructArrearItem({
			includedUsage: 100,
			featureId: TestFeature.Messages,
			price: 200, // $2.00 per unit (200 cents per billing unit of 1)
			billingUnits: 1,
		}),
	],
});

// Group 2 products (use Words feature)
const proGroup2 = constructProduct({
	id: "proGroup2",
	group: `${testCase}-g2`,
	type: "pro",
	items: [
		constructArrearItem({
			includedUsage: 10,
			featureId: TestFeature.Words,
			price: 60, // $0.60 per unit (60 cents per billing unit of 1)
			billingUnits: 1,
		}),
	],
});

const premiumGroup2 = constructProduct({
	id: "premiumGroup2",
	group: `${testCase}-g2`,
	type: "premium",
	items: [
		constructArrearItem({
			includedUsage: 10,
			featureId: TestFeature.Words,
			price: 90, // $0.90 per unit (90 cents per billing unit of 1)
			billingUnits: 1,
		}),
	],
});

describe(
	chalk.yellowBright(`${testCase}: Testing multi product attach, and upgrade`),
	() => {
		const customerId = testCase;
		beforeAll(async () => {
			await initProductsV0({
				ctx,
				products: [proGroup1, proGroup2, premiumGroup1, premiumGroup2],
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

		test("should attach pro group 1 and pro group 2", async () => {
			await AutumnCli.attach({
				customerId: customerId,
				productIds: [proGroup1.id, proGroup2.id],
			});

			const cusRes = await AutumnCli.getCustomer(customerId);
			await expectCustomerV0Correct({ sent: proGroup1, cusRes });
			await expectCustomerV0Correct({ sent: proGroup2, cusRes });
		});

		test("should upgrade to premium group 1", async () => {
			await AutumnCli.attach({
				customerId: customerId,
				productId: premiumGroup1.id,
			});

			// 1. Compare main product
			const cusRes = await AutumnCli.getCustomer(customerId);
			await expectCustomerV0Correct({ sent: premiumGroup1, cusRes });
		});

		test("should upgrade to premium group 2", async () => {
			await AutumnCli.attach({
				customerId: customerId,
				productId: premiumGroup2.id,
			});

			// 1. Compare main product
			const cusRes = await AutumnCli.getCustomer(customerId);
			await expectCustomerV0Correct({ sent: premiumGroup2, cusRes });
		});
	},
);
