/** biome-ignore-all lint/suspicious/noExportsInTest: needed */

import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type AppEnv } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import {
	getLifetimeFreeCusEnt,
	getUsageCusEnt,
} from "@tests/utils/cusProductUtils/cusEntSearchUtils.js";
import { getMainCusProduct } from "@tests/utils/cusProductUtils/cusProductUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addMonths } from "date-fns";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// Scenario 1: lifetime + pay per use monthly -> lifetime + pay per use monthly
const pro = constructProduct({
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
		customerId,
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

const testCase = "multiFeature3";
// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
	`${testCase}: Testing lifetime + pay per use, advance test clock`,
)}`, () => {
	const autumn: AutumnInt = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});
	const customerId = testCase;

	let totalUsage = 0;

	let testClockId: string;
	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = res.testClockId!;
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

	const overageValue = 30;
	test("should use lifetime allowance + overage", async () => {
		let value = 50; // pro.items[0].includedUsage
		value += overageValue;

		await autumn.track({
			customer_id: customerId,
			value,
			feature_id: TestFeature.Messages,
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

		expect(lifetimeCusEnt?.balance).toBe(0);
		expect(usageCusEnt?.balance).toBe(-overageValue);
	});

	test("cycle 1:should have correct usage after first cycle", async () => {
		const advanceTo = addMonths(new Date(), 1).getTime();
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			advanceTo,
			waitForSeconds: 20,
		});

		const { lifetimeCusEnt, usageCusEnt } = await getLifetimeAndUsageCusEnts({
			customerId,
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			featureId: TestFeature.Messages,
		});

		expect(lifetimeCusEnt?.balance).toBe(0);
		expect(usageCusEnt?.balance).toBe(0);
	});
});
