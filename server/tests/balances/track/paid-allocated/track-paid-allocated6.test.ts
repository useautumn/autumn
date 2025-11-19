import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion, OnDecrease, OnIncrease } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { attachFailedPaymentMethod } from "../../../../src/external/stripe/stripeCusUtils";
import { CusService } from "../../../../src/internal/customers/CusService";
import { expectAutumnError } from "../../../utils/expectUtils/expectErrUtils";

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

const testCase = "track-paid-allocated6";

describe(`${chalk.yellowBright(`${testCase}: Testing track usage for cont use, bill immediately but payment fails`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

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
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const cus = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		await attachFailedPaymentMethod({
			stripeCli: ctx.stripeCli,
			customer: cus!,
		});
	});

	test("should create track +3 usage and hit an error", async () => {
		await expectAutumnError({
			func: async () => {
				await autumn.track({
					customer_id: customerId,
					feature_id: TestFeature.Users,
					value: 3,
				});
			},
		});

		const customer = await autumn.customers.get(customerId);
		expect(customer.features[TestFeature.Users].balance).toBe(1);
	});
});
