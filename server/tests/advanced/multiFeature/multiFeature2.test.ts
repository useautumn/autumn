import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type AppEnv, LegacyVersion } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import {
	getLifetimeFreeCusEnt,
	getUsageCusEnt,
} from "tests/utils/cusProductUtils/cusEntSearchUtils.js";
import { getMainCusProduct } from "tests/utils/cusProductUtils/cusProductUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// Scenario 1: lifetime + pay per use monthly -> pay per use monthly
const pro = constructProduct({
	id: "multiFeature2Pro",
	type: "pro",
	excludeBase: true,
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 50,
			interval: null,
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
	id: "multiFeature2Premium",
	type: "premium",
	excludeBase: true,
	items: [
		// Pay per use
		constructArrearItem({
			featureId: TestFeature.Messages,
			includedUsage: 0,
			price: 1,
			billingUnits: 1,
		}),
	],
});

export const getLifetimeAndUsageCusEnts = async ({
	customerId,
	db,
	orgId,
	env,
	featureId,
}: {
	customerId: string;
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	featureId: string;
}) => {
	const mainCusProduct = await getMainCusProduct({
		customerId: customerId,
		db,
		orgId,
		env,
	});

	const lifetimeCusEnt = getLifetimeFreeCusEnt({
		cusProduct: mainCusProduct!,
		featureId,
	});

	const usageCusEnt = getUsageCusEnt({
		cusProduct: mainCusProduct!,
		featureId,
	});

	return { lifetimeCusEnt, usageCusEnt };
};

const testCase = "multiFeature2";
describe(`${chalk.yellowBright(
	"multiFeature2: Testing lifetime + pay per use -> pay per use",
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
			attachPm: "success",
			withTestClock: false,
		});
	});

	test("should attach pro product to customer", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const { lifetimeCusEnt, usageCusEnt } = await getLifetimeAndUsageCusEnts({
			customerId,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			featureId: TestFeature.Messages,
		});

		expect(lifetimeCusEnt?.balance).toBe(50); // pro.items[0].includedUsage

		expect(usageCusEnt?.balance).toBe(0); // pro.items[1].includedUsage
	});

	test("should use lifetime allowance first", async () => {
		const value = 50; // pro.items[0].includedUsage

		await autumn.events.send({
			customerId,
			value,
			featureId: TestFeature.Messages,
		});

		totalUsage += value;

		await timeout(3000);

		const { lifetimeCusEnt, usageCusEnt } = await getLifetimeAndUsageCusEnts({
			customerId,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			featureId: TestFeature.Messages,
		});

		expect(lifetimeCusEnt?.balance).toBe(50 - value); // pro.items[0].includedUsage - value
		expect(usageCusEnt?.balance).toBe(0); // pro.items[1].includedUsage
	});

	test("should have correct usage after upgrade", async () => {
		const value = 20;

		await autumn.track({
			customer_id: customerId,
			value,
			feature_id: TestFeature.Messages,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: premium.id,
		});

		// return;
		const { lifetimeCusEnt, usageCusEnt: newUsageCusEnt } =
			await getLifetimeAndUsageCusEnts({
				customerId,
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				featureId: TestFeature.Messages,
			});

		expect(lifetimeCusEnt).toBeUndefined();
		expect(newUsageCusEnt?.balance).toBe(0);

		// Check invoice too
		// const res = await autumn2.customers.get(customerId);
		// const invoices = res.invoices;

		// const invoice0Amount = value * 0.5; // value * pro.items[1].price
		// expect(invoices![0].total).toBe(invoice0Amount);
	});
});
