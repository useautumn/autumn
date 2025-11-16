import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCusProductV3,
	type ApiCustomerV3,
	CreateFreeTrialSchema,
	CusProductStatus,
	FreeTrialDuration,
	LegacyVersion,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addDays } from "date-fns";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "free1";

const trial1 = CreateFreeTrialSchema.parse({
	length: 7,
	duration: FreeTrialDuration.Day,
});

export const free = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	isDefault: false,
	freeTrial: trial1,
	type: "free",
	id: "enterprise_trial",
});
export const addOn = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 1000,
		}),
	],
	isDefault: false,
	type: "free",
	isAddOn: true,
	id: "add_on",
});

describe(`${chalk.yellowBright(`${testCase}: Testing free product with trial and attaching add on`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({
		version: LegacyVersion.v1_4,
		orgConfig: { multiple_trials: true },
	});
	let testClockId: string;

	beforeAll(async () => {
		const result = await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = result.testClockId!;

		await initProductsV0({
			ctx,
			products: [free, addOn],
			prefix: testCase,
		});
	});

	const approximateDiff = 1000 * 60 * 80; // 60 minutes
	test("should attach free product with trial", async () => {
		const attachPreview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: free.id,
		});

		const attach = await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		const customer = await autumn.customers.get(customerId);
		const freeProduct = customer.products.find(
			(p) => p.id === free.id,
		) as ApiCusProductV3;

		expect(freeProduct).toBeDefined();
		expect(freeProduct?.status).toBe(CusProductStatus.Trialing);
		expect(freeProduct?.current_period_end).toBeGreaterThanOrEqual(
			addDays(Date.now(), trial1.length).getTime() - approximateDiff,
		);
		expect(freeProduct?.current_period_end).toBeLessThanOrEqual(
			addDays(Date.now(), trial1.length).getTime() + approximateDiff,
		);
	});

	const trial2 = CreateFreeTrialSchema.parse({
		length: 14,
		duration: FreeTrialDuration.Day,
	});

	test("should update free product's trial end date", async () => {
		const attachPreview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: free.id,
			free_trial: trial2,
			is_custom: true,
		});

		const attach = await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
			free_trial: trial2,
			is_custom: true,
		});

		const customer = await autumn.customers.get(customerId);
		const freeProduct = customer.products.find(
			(p) => p.id === free.id,
		) as ApiCusProductV3;

		expect(freeProduct?.status).toBe(CusProductStatus.Trialing);
		expect(freeProduct?.current_period_end).toBeGreaterThanOrEqual(
			addDays(Date.now(), trial2.length).getTime() - approximateDiff,
		);
		expect(freeProduct?.current_period_end).toBeLessThanOrEqual(
			addDays(Date.now(), trial2.length).getTime() + approximateDiff,
		);
	});

	test("should attach add on product", async () => {
		const attachPreview = await autumn.attachPreview({
			customer_id: customerId,
			product_id: addOn.id,
		});

		const attach = await autumn.attach({
			customer_id: customerId,
			product_id: addOn.id,
		});

		const customer = (await autumn.customers.get(customerId)) as ApiCustomerV3;
		const addOnProduct = customer.products.find((p) => p.id === addOn.id);
		const freeProduct = customer.products.find((p) => p.id === free.id);

		expect(addOnProduct).toBeDefined();
		expect(addOnProduct?.status).toBe("active");
		expect(freeProduct?.status).toBe("trialing");
	});
});
