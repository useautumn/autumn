import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { expectAutumnError } from "../../../utils/expectUtils/expectErrUtils";
import { timeout } from "../../../utils/genUtils";
import { getCustomerEvents } from "../../testBalanceUtils";

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

// Generate unique idempotency keys per test run to avoid Redis TTL conflicts
const testRunId = Date.now().toString(36);

describe(`${chalk.yellowBright("track-basic6: test idempotency key prevents duplicate tracks")}`, () => {
	const customerId = "track-basic6";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const idempotencyKey1 = `test-idempotency-key-1-${testRunId}`;
	const idempotencyKey2 = `test-idempotency-key-2-${testRunId}`;

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

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
			idempotency_key: idempotencyKey1,
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		const expectedBalance = new Decimal(100).sub(deductValue).toNumber();

		expect(balance).toBe(expectedBalance);
		expect(usage).toBe(deductValue);

		await timeout(2000);
		const eventsList = await getCustomerEvents({ customerId });
		expect(eventsList).toHaveLength(1);
		expect(eventsList?.[0].idempotency_key).toBe(idempotencyKey1);
		expect(eventsList?.[0].value).toBe(deductValue);
	});

	test("should reject second track with same idempotency key", async () => {
		const deductValue = 30.75; // Different value

		// Get balance before attempting duplicate track
		const customerBefore = await autumnV1.customers.get(customerId);
		const balanceBefore = customerBefore.features[TestFeature.Messages].balance;
		// This should fail or be rejected due to duplicate idempotency key
		await expectAutumnError({
			errCode: ErrCode.DuplicateIdempotencyKey,
			func: async () => {
				await autumnV1.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: deductValue,
					idempotency_key: idempotencyKey1, // Same key as first test
				});
			},
		});

		// Balance should remain unchanged
		const customerAfter = await autumnV1.customers.get(customerId);

		const balanceAfter = customerAfter.features[TestFeature.Messages].balance;
		expect(balanceAfter).toBe(balanceBefore);

		await timeout(2000);
		const customerAfter2 = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const balanceAfter2 = customerAfter2.features[TestFeature.Messages].balance;
		expect(balanceAfter2).toBe(balanceBefore);

		const eventsList = await getCustomerEvents({ customerId });
		expect(eventsList).toHaveLength(1);
		expect(eventsList?.[0].idempotency_key).toBe(idempotencyKey1);
	});

	test("should process track with different idempotency key", async () => {
		const deductValue = 15.25;

		const customerBefore = await autumnV1.customers.get(customerId);
		const balanceBefore = customerBefore.features[TestFeature.Messages].balance;

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
			idempotency_key: idempotencyKey2, // Different key
		});

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		const expectedBalance = new Decimal(balanceBefore!)
			.sub(deductValue)
			.toNumber();

		expect(balance).toBe(expectedBalance);
	});
});
