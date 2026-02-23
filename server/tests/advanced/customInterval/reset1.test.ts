import { beforeAll, describe, expect, test } from "bun:test";
import {
	type AppEnv,
	type Customer,
	LegacyVersion,
	type LimitedItem,
	type Organization,
	ProductItemInterval,
} from "@autumn/shared";
import { resetAndGetCusEnt } from "@tests/balances/track/rollovers/rolloverTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { addDays, addMonths } from "date-fns";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 400,
	interval: ProductItemInterval.Day,
	intervalCount: 3,
}) as LimitedItem;

const wordsItem = constructFeatureItem({
	featureId: TestFeature.Words,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
	intervalCount: 4,
}) as LimitedItem;

export const free = constructProduct({
	items: [messagesItem, wordsItem],
	type: "free",
	isDefault: false,
});

const testCase = "reset1";

describe(`${chalk.yellowBright(`${testCase}: Testing custom reset intervals`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let customer: Customer;
	let stripeCli: Stripe;
	const curUnix = new Date().getTime();

	beforeAll(async () => {
		db = ctx.db;
		org = ctx.org;
		env = ctx.env;

		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [free],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
		});

		testClockId = res.testClockId!;
		customer = res.customer;
	});

	test("should attach free product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});
	});

	const messageUsage = 250;
	const curBalance = messagesItem.included_usage;

	test("should reset messages feature and have correct next reset at", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messageUsage,
		});

		await timeout(3000);

		await resetAndGetCusEnt({
			db,
			customer,
			productGroup: free.group || "",
			featureId: TestFeature.Messages,
		});

		const cus = await autumn.customers.get(customerId);
		const msgesFeature = cus.features[TestFeature.Messages];
		expect(msgesFeature.next_reset_at).toBeDefined();
		expect(msgesFeature.next_reset_at).toBeCloseTo(
			addDays(new Date(), 3).getTime(),
			-4, // tolerance of ~30 seconds (30000ms = 10^4.48)
		);
	});

	test("should reset words feature and have correct next reset at", async () => {
		await resetAndGetCusEnt({
			db,
			customer,
			productGroup: free.group || "",
			featureId: TestFeature.Words,
		});

		const cus = await autumn.customers.get(customerId);
		const wordsFeature = cus.features[TestFeature.Words];
		expect(wordsFeature.next_reset_at).toBeDefined();
		expect(wordsFeature.next_reset_at).toBeCloseTo(
			addMonths(new Date(), 4).getTime(),
			-8, // tolerance of ~30 minutes (1800000ms = 10^6.26, round down to -8)
		);
	});
});
