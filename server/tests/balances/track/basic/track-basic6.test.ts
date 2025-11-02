import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "track-basic6";

describe(`${chalk.yellowBright("track-basic6: test idempotency key prevents duplicate tracks")}`, () => {
	const customerId = "track-basic6";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});
	});

	test("should have initial balance of 100", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(100);
	});

	test("should process first track with idempotency key", async () => {
		const deductValue = 25.5;
		const idempotencyKey = "test-idempotency-key-1";

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
			idempotency_key: idempotencyKey,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		const expectedBalance = new Decimal(100).sub(deductValue).toNumber();

		expect(balance).toBe(expectedBalance);
		expect(usage).toBe(deductValue);
	});

	test("should reject second track with same idempotency key", async () => {
		const deductValue = 30.75; // Different value
		const idempotencyKey = "test-idempotency-key-1"; // Same key

		// Get balance before attempting duplicate track
		const customerBefore = await autumnV1.customers.get(customerId);
		const balanceBefore = customerBefore.features[TestFeature.Messages].balance;

		// This should fail or be rejected due to duplicate idempotency key
		let errorThrown = false;
		try {
			await autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: deductValue,
				idempotency_key: idempotencyKey,
			});
		} catch (error) {
			errorThrown = true;
			// Optionally check error type/message
		}

		expect(errorThrown).toBe(true);

		// Balance should remain unchanged
		const customerAfter = await autumnV1.customers.get(customerId);
		const balanceAfter = customerAfter.features[TestFeature.Messages].balance;

		expect(balanceAfter).toBe(balanceBefore);
	});

	test("should process track with different idempotency key", async () => {
		const deductValue = 15.25;
		const idempotencyKey = "test-idempotency-key-2"; // Different key

		const customerBefore = await autumnV1.customers.get(customerId);
		const balanceBefore = customerBefore.features[TestFeature.Messages].balance;

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
			idempotency_key: idempotencyKey,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		const expectedBalance = new Decimal(balanceBefore!)
			.sub(deductValue)
			.toNumber();

		expect(balance).toBe(expectedBalance);
	});
});
