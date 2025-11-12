import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	CusProductStatus,
	FreeTrialDuration,
	ProductItemInterval,
} from "@autumn/shared";
import { AutumnCli } from "@tests/cli/AutumnCli.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
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

const testCase = "basic8";
const customerId = testCase;
const customerId2 = `${testCase}2`;

describe(`${chalk.yellowBright("basic8: Testing trial duplicates (same fingerprint)")}`, () => {
	const autumnV1 = new AutumnInt({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V1_2,
	});

	const randFingerprint = Math.random().toString(36).substring(2, 15);

	beforeAll(async () => {
		// Create products FIRST before customer creation
		await initProductsV0({
			ctx,
			products: [proWithTrial],
			prefix: testCase,
			customerIds: [customerId, customerId2],
		});

		// Create first customer with fingerprint
		await initCustomerV3({
			ctx,
			customerId,
			customerData: { fingerprint: randFingerprint },
			attachPm: "success",
			withTestClock: true,
		});

		// Create second customer with same fingerprint
		await initCustomerV3({
			ctx,
			customerId: customerId2,
			customerData: { fingerprint: randFingerprint },
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

	test("should attach pro with trial to second customer and have correct product & invoice (pro with trial, full price)", async () => {
		await autumnV1.attach({
			customer_id: customerId2,
			product_id: proWithTrial.id,
		});

		const customer = await AutumnCli.getCustomer(customerId2);

		await expectCustomerV0Correct({
			sent: proWithTrial,
			cusRes: customer,
			status: CusProductStatus.Active,
		});

		const invoices = customer.invoices;
		expect(invoices.length).toBe(1);
		expect(invoices[0].total).toBe(20);
	});
});
