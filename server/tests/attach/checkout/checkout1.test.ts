import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV0,
	type Entitlement,
	ProductItemInterval,
} from "@autumn/shared";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import { timeout } from "@tests/utils/genUtils.js";
import { completeCheckoutForm } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";

import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { convertProductV2ToV1 } from "@/internal/products/productUtils/productV2Utils/convertProductV2ToV1.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// Pro product with boolean, metered, and unlimited features
const proProd = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Dashboard,
			isBoolean: true,
		}),
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 10,
			interval: ProductItemInterval.Month,
		}),
		// Unlimited feature (maps to global products.pro.infinite1)
		constructFeatureItem({
			featureId: TestFeature.Admin,
			unlimited: true,
		}),
	],
});

const testCase = "checkout1";
const customerId = testCase;

describe(`${chalk.yellowBright("checkout1: Testing attach basic product through checkout")}`, () => {
	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [proProd],
			prefix: testCase,
			customerId,
		});

		// Then create customer
		await initCustomerV3({
			ctx,
			customerId,
			customerData: { fingerprint: "test" },
			withTestClock: true,
		});
	});

	test("should attach pro through checkout", async () => {
		const { checkout_url } = await autumnV1.attach({
			customer_id: customerId,
			product_id: proProd.id,
		});

		await completeCheckoutForm(checkout_url);
		await timeout(12000);
	});

	test("should have correct product & entitlements", async () => {
		const res = await AutumnCli.getCustomer(customerId);

		await expectCustomerV0Correct({
			sent: proProd,
			cusRes: res,
		});
		expect(res.invoices.length).toBeGreaterThan(0);
	});

	test("should have correct result when calling /check", async () => {
		// Convert ProductV2 to V1 to get reference entitlements (what we SENT)
		const proProdV1 = convertProductV2ToV1({
			productV2: proProd,
			orgId: ctx.org.id,
			features: ctx.features,
		});
		const proEntitlements = proProdV1.entitlements;

		// Iterate through reference product's entitlements and verify check responses
		for (const entitlement of Object.values(proEntitlements) as Entitlement[]) {
			const allowance = entitlement.allowance;

			const res = (await AutumnCli.entitled(
				customerId,
				entitlement.feature_id!,
			)) as CheckResponseV0;

			const entBalance = res.balances.find(
				(b) => b.feature_id === entitlement.feature_id,
			);

			expect(
				res.allowed,
				`Allowed for ${entitlement.feature_id} is not true`,
			).toBe(true);
			expect(
				entBalance,
				`Entitlement ${entitlement.feature_id} balance not found`,
			).toBeDefined();
			if (entitlement.allowance) {
				expect(
					entBalance?.balance,
					`Entitlement ${entitlement.feature_id} balance does not match expected balance.`,
				).toBe(allowance);
			}
		}
	});
});
