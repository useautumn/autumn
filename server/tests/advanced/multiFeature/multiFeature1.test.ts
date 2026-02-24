import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type AppEnv, LegacyVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import {
	getPrepaidCusEnt,
	getUsageCusEnt,
} from "@tests/utils/cusProductUtils/cusEntSearchUtils.js";
import { getMainCusProduct } from "@tests/utils/cusProductUtils/cusProductUtils.js";
import ctx, { type TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import {
	constructArrearItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// Scenario 1: prepaid + pay per use monthly -> prepaid + pay per use monthly
const pro = constructProduct({
	id: "multiFeature1Pro",
	type: "pro",
	excludeBase: true,
	items: [
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			includedUsage: 50,
			price: 10,
			billingUnits: 1,
		}),
		constructArrearItem({
			featureId: TestFeature.Messages,
			includedUsage: 0,
			price: 0.5,
			billingUnits: 1,
		}),
	],
});

const premium = constructProduct({
	id: "multiFeature1Premium",
	type: "premium",
	excludeBase: true,
	items: [
		// Prepaid
		constructPrepaidItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
			price: 15,
			billingUnits: 1,
			resetUsageWhenEnabled: false,
		}),
		// Pay per use
		constructArrearItem({
			featureId: TestFeature.Messages,
			includedUsage: 0,
			price: 1,
			billingUnits: 1,
		}),
	],
});

export const getPrepaidAndUsageCusEnts = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: TestContext;
	customerId: string;
	featureId: string;
}) => {
	const mainCusProduct = await getMainCusProduct({
		ctx,
		customerId,
	});

	const prepaidCusEnt = getPrepaidCusEnt({
		cusProduct: mainCusProduct!,
		featureId,
	});

	const usageCusEnt = getUsageCusEnt({
		cusProduct: mainCusProduct!,
		featureId,
	});

	return { prepaidCusEnt, usageCusEnt };
};

const testCase = "multiFeature1";
describe(`${chalk.yellowBright(
	"multiFeature1: Testing prepaid + pay per use -> prepaid + pay per use",
)}`, () => {
	const autumn: AutumnInt = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});
	const autumn2: AutumnInt = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: LegacyVersion.v1_2,
	});
	const customerId = testCase;

	let totalUsage = 0;
	const prepaidQuantity = 10;
	const prepaidAllowance = 50 + prepaidQuantity; // pro.items[0].includedUsage + prepaidQuantity
	const premiumPrepaidAllowance = 100 + prepaidQuantity; // premium.items[0].includedUsage + prepaidQuantity

	const optionsList = [
		{
			feature_id: TestFeature.Messages,
			quantity: prepaidQuantity,
		},
	];

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: false,
		});
	});

	test("should attach pro product to customer", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			options: optionsList,
		});

		const { prepaidCusEnt, usageCusEnt } = await getPrepaidAndUsageCusEnts({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		expect(prepaidCusEnt?.balance).toBe(prepaidAllowance);
		expect(usageCusEnt?.balance).toBe(0); // pro.items[1].includedUsage
	});

	test("should use prepaid allowance first", async () => {
		const value = 60;

		await autumn.track({
			customer_id: customerId,
			value,
			feature_id: TestFeature.Messages,
		});

		totalUsage += value;

		await timeout(3000);

		const { prepaidCusEnt, usageCusEnt } = await getPrepaidAndUsageCusEnts({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		expect(prepaidCusEnt?.balance).toBe(prepaidAllowance - value);
		expect(usageCusEnt?.balance).toBe(0); // pro.items[1].includedUsage
	});

	test("should have correct usage / invoice after upgrade", async () => {
		const value = 60;
		await autumn.track({
			customer_id: customerId,
			value,
			feature_id: TestFeature.Messages,
		});

		// totalUsage += value;

		await timeout(2500);

		const { usageCusEnt } = await getPrepaidAndUsageCusEnts({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
			options: optionsList,
		});

		const { prepaidCusEnt, usageCusEnt: newUsageCusEnt } =
			await getPrepaidAndUsageCusEnts({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			});

		// Check invoice too
		const { invoices } = await autumn2.customers.get(customerId);
		const invoice1Amount = 15 * prepaidQuantity - 10 * prepaidQuantity; // premium.items[0].price * prepaidQuantity - pro.items[0].price * prepaidQuantity
		const invoice0Amount = value * 0.5; // value * pro.items[1].price
		const totalAmount = invoice1Amount + invoice0Amount;
		expect(invoices![0].total).toBe(totalAmount);

		// const leftover = premiumPrepaidAllowance - totalUsage + value;
		// console.log(
		// 	`Premium prepaid allowance: ${premiumPrepaidAllowance} - totalUsage: ${totalUsage}`,
		// );
		// console.log(`prepaidCusEnt?.balance: ${prepaidCusEnt?.balance}`);
		expect(prepaidCusEnt?.balance).toBe(premiumPrepaidAllowance - totalUsage);
		expect(newUsageCusEnt?.balance).toBe(0);
	});
});
