import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	CusProductStatus,
	type FixedPriceConfig,
	FreeTrialDuration,
	ProductItemInterval,
} from "@autumn/shared";
import chalk from "chalk";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { convertProductV2ToV1 } from "@/internal/products/productUtils/productV2Utils/convertProductV2ToV1.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

// Pro product with trial (matches global products.proWithTrial)
const proWithTrial = constructProduct({
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
		constructFeatureItem({
			featureId: TestFeature.Admin,
			unlimited: true,
		}),
	],
	freeTrial: {
		length: 7,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: true,
		card_required: true,
	},
});

const testCase = "basic7";
const customerId = testCase;

describe(`${chalk.yellowBright("basic7: Testing trial duplicates (same customer)")}`, () => {
	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});

	beforeAll(async () => {
		// Create products FIRST before customer creation
		await initProductsV0({
			ctx,
			products: [proWithTrial],
			prefix: testCase,
			customerId,
		});

		// Then create customer with payment method
		await initCustomerV3({
			ctx,
			customerId,
			attachPm: "success",
			withTestClock: true,
		});
	});

	test("should attach pro with trial and have correct product & invoice", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: proWithTrial.id,
		});

		const customer = await AutumnCli.getCustomer(customerId);

		await expectCustomerV0Correct({
			sent: proWithTrial,
			cusRes: customer,
			status: CusProductStatus.Trialing,
		});

		const invoices = customer.invoices;
		expect(invoices.length).toBe(1);
		expect(invoices[0].total).toBe(0);
	});

	test("should cancel pro with trial", async () => {
		await autumnV1.cancel({
			customer_id: customerId,
			product_id: proWithTrial.id,
			cancel_immediately: true,
		});
		await timeout(5000);
	});

	test("should be able to attach pro with trial again (renewal flow)", async () => {
		await autumnV1.attach({
			customer_id: customerId,
			product_id: proWithTrial.id,
		});

		const customer = await AutumnCli.getCustomer(customerId);

		await expectCustomerV0Correct({
			sent: proWithTrial,
			cusRes: customer,
		});

		const invoices = customer.invoices;
		expect(invoices.length).toBe(2);

		// Get price from converted product
		const proWithTrialV1 = convertProductV2ToV1({
			productV2: proWithTrial,
			orgId: ctx.org.id,
			features: ctx.features,
		});

		expect(invoices[0].total).toBe(
			(proWithTrialV1.prices[0].config as FixedPriceConfig).amount,
		);
	});
});
