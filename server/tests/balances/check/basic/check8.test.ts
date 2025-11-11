import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV1, SuccessCode } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 1000,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "check8";
const customerId = "check8";

describe(`${chalk.yellowBright("check8: test public key & send_event")}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	let autumnPublic: AutumnInt;

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

		// Initialize Autumn client with public key
		autumnPublic = new AutumnInt({
			version: ApiVersion.V1_2,
			secretKey: ctx.org.test_pkey!,
		});
	});

	test("should work with public key for /check endpoint", async () => {
		const res = (await autumnPublic.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 100,
		})) as unknown as CheckResponseV1;

		expect(res).toMatchObject({
			allowed: true,
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance: 1000,
			required_balance: 100,
			code: SuccessCode.FeatureFound,
			usage: 0,
			included_usage: 1000,
			overage_allowed: false,
		});

		expect(res.next_reset_at).toBeDefined();
	});

	test("should not track usage when send_event: true with public key", async () => {
		// Get current balance before
		const customerBefore: any = await autumnV1.customers.get(customerId);
		const balanceBefore = customerBefore.features[TestFeature.Messages].balance;
		const usedBefore = customerBefore.features[TestFeature.Messages].used;

		// Call check with public key and send_event: true
		// This should succeed but NOT send events (silently skipped)
		const checkRes = (await autumnPublic.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 50,
			send_event: true,
		})) as unknown as CheckResponseV1;

		expect(checkRes.allowed).toBe(true);

		// Wait for potential event processing
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Get customer and verify balance stayed the same
		const customerAfter: any = await autumnV1.customers.get(customerId);
		const balanceAfter = customerAfter.features[TestFeature.Messages].balance;

		expect(balanceAfter).toBe(balanceBefore);
		expect(customerAfter.features[TestFeature.Messages].used).toBe(usedBefore);
	});

	test("should track usage when send_event: true with secret key", async () => {
		// Call check with send_event: true
		const checkRes = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 150,
			send_event: true,
		})) as unknown as CheckResponseV1;

		expect(checkRes.allowed).toBe(true);
		expect(checkRes.balance).toBe(1000);

		// Wait for event to be processed
		await timeout(2000);

		// Get customer and verify balance decreased
		const customer: any = await autumnV1.customers.get(customerId);
		const balanceAfter = customer.features[TestFeature.Messages].balance;

		expect(balanceAfter).toBe(850); // 1000 - 150
		expect(customer.features[TestFeature.Messages].usage).toBe(150);
	});

	test("should not track usage when send_event: true but insufficient balance", async () => {
		// Get current balance first
		const customerBefore: any = await autumnV1.customers.get(customerId);
		const balanceBefore = customerBefore.features[TestFeature.Messages].balance;

		// Call check with required_balance > current balance
		const checkRes = (await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			required_balance: 900, // More than available (850)
			send_event: true,
		})) as unknown as CheckResponseV1;

		expect(checkRes.allowed).toBe(false);

		// Wait for potential event processing
		await timeout(2000);

		// Get customer and verify balance stayed the same
		const customerAfter: any = await autumnV1.customers.get(customerId);
		const balanceAfter = customerAfter.features[TestFeature.Messages].balance;

		expect(balanceAfter).toBe(balanceBefore);
		expect(customerAfter.features[TestFeature.Messages].usage).toBe(150); // Same as before
	});
});
