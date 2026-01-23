import { beforeAll, describe, expect, test } from "bun:test";
import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

export const free = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
		}),
	],
	isAnnual: false,
	type: "free",
	isDefault: false,
});

// Pro trial

// Pro

const testCase = "others9";

describe(`${chalk.yellowBright(`${testCase}: Testing attach free product again`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			customerData: { fingerprint: "test" },
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [free],
			prefix: testCase,
		});
	});

	test("should attach free product, then try again and hit error", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: free,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			skipSubCheck: true,
		});

		await expectAutumnError({
			func: async () => {
				await autumn.attach({
					customer_id: customerId,
					product_id: free.id,
				});
			},
		});
	});
});
