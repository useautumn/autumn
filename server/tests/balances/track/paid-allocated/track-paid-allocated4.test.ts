import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	LegacyVersion,
	OnDecrease,
	OnIncrease,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectSubQuantityCorrect } from "@tests/utils/expectUtils/expectContUseUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { getV2Balance } from "../../testBalanceUtils";

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: 50,
	includedUsage: 1,
	config: {
		on_increase: OnIncrease.BillImmediately,
		on_decrease: OnDecrease.None,
	},
});

export const pro = constructProduct({
	items: [userItem],
	type: "pro",
});

const testCase = "track-paid-allocated4";

describe(`${chalk.yellowBright(`${testCase}: Testing track usage for cont use (without overage)`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});
	});

	let usage = 0;
	test("should attach pro", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});

	test("should track +1 and have no new invoice", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 1,
		});

		usage += 1;

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).toBe(1);
	});

	test("should track -1 and have no new invoice", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: -1,
		});

		usage -= 1;

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
		});

		// Verify balance values reflect the replaceable (unused) logic
		const v2Balance = await getV2Balance({
			customerId,
			featureId: TestFeature.Users,
		});

		expect(v2Balance).toMatchObject({
			granted_balance: 1,
			purchased_balance: 0,
			current_balance: 1,
			usage: 0,
		});
	});
});
