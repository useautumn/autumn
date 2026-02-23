import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { getMainCusProduct } from "@tests/utils/cusProductUtils/cusProductUtils.js";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import AutumnError from "@/external/autumn/autumnCli";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";
import { generateId, timeout } from "@/utils/genUtils.js";

// ============================================================================
// Test 1: Auto-create customer and entity via attach
// ============================================================================
test.concurrent(`${chalk.yellowBright("attach-misc: auto-create customer and entity via attach")}`, async () => {
	const prefix = "attach-misc-autocreate";
	const customerId = prefix;
	const entityId = "entity-1";

	const wordsItem = items.monthlyWords({ includedUsage: 1000 });
	const pro = products.pro({ items: [wordsItem] });

	// Setup products only (no customer - we'll auto-create via attach)
	const { autumnV1 } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [pro], prefix }),
		],
		actions: [],
	});

	// Attach with customer_data and entity_data to auto-create both
	const attachResponse = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entityId,
		customer_data: {
			name: "Auto Created Customer",
			email: "autocreated@test.com",
			fingerprint: "test-fingerprint-123",
			internal_options: {
				disable_defaults: true,
			},
		},
		entity_data: {
			name: "Auto Created Entity",
			feature_id: TestFeature.Users,
		},
	});

	expect(attachResponse).toBeDefined();

	// Verify customer was auto-created
	const customer = await autumnV1.customers.get(customerId);
	expect(customer).toBeDefined();
	expect(customer.id).toBe(customerId);
	expect(customer.name).toBe("Auto Created Customer");
	expect(customer.email).toBe("autocreated@test.com");
	expect(customer.fingerprint).toBe("test-fingerprint-123");

	// Verify entity was auto-created
	const entity = await autumnV1.entities.get(customerId, entityId);
	expect(entity).toBeDefined();
	expect(entity.id).toBe(entityId);
	expect(entity.name).toBe("Auto Created Entity");
	expect(entity.customer_id).toBe(customerId);
});

// ============================================================================
// Test 4: Convert collection method from send_invoice
// ============================================================================
test.concurrent(`${chalk.yellowBright("attach-misc: convert collection method from send_invoice to charge_automatically")}`, async () => {
	const customerId = "attach-misc-collection";

	const wordsItem = items.monthlyWords({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [wordsItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro], prefix: customerId }),
		],
		actions: [],
	});

	const { stripeCli } = ctx;

	// Attach with invoice option
	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		invoice: true,
		enable_product_immediately: true,
	});

	expect(res.invoice).toBeDefined();

	const customer = await autumnV1.customers.get(customerId);
	expectProductAttached({
		customer,
		product: pro,
	});

	const invoiceStripeId = res.invoice.stripe_id;
	await stripeCli.invoices.finalizeInvoice(invoiceStripeId);
	await stripeCli.invoices.pay(invoiceStripeId);

	// Wait for webhook processing
	await timeout(10000);

	const cusProduct = await getMainCusProduct({
		ctx,
		customerId,
		productGroup: pro.group ?? undefined,
	});

	const sub = await cusProductToSub({
		cusProduct,
		stripeCli,
	});

	expect(sub?.collection_method ?? undefined).toBe("charge_automatically");
});

// ============================================================================
// Test 2: Attach race condition
// ============================================================================
test.skip(`${chalk.yellowBright("attach-misc: attach race condition - concurrent calls")}`, async () => {
	const prefix = "attach-misc-race";
	const customerId = prefix;

	const wordsItem = items.monthlyWords({ includedUsage: 1000 });
	const pro = products.pro({ items: [wordsItem] });

	// Setup products only (no customer - we'll auto-create via attach)
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.products({ list: [pro] })],
		actions: [],
	});

	// Concurrent attach calls
	const responses = await Promise.allSettled([
		autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		}),
		autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		}),
	]);

	// At least one should succeed, both shouldn't fail
	const successes = responses.filter((r) => r.status === "fulfilled");
	expect(successes.length).toEqual(1);
});

// ============================================================================
// Test 3: Idempotency key - duplicate requests rejected
// (from others10)
// ============================================================================
test.concurrent(`${chalk.yellowBright("attach-misc: idempotency key duplicate rejected")}`, async () => {
	const customerId = "attach-misc-idempotency";

	const creditsItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [creditsItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const idempotencyKey = generateId("it");

	// Send two concurrent attach requests with the same idempotency key
	const results = await Promise.allSettled([
		autumnV1.attach(
			{
				customer_id: customerId,
				product_id: pro.id,
			},
			{
				idempotencyKey,
			},
		),
		autumnV1.attach(
			{
				customer_id: customerId,
				product_id: pro.id,
			},
			{
				idempotencyKey,
			},
		),
	]);

	// Exactly one request should succeed
	const fulfilled = results.filter((r) => r.status === "fulfilled");
	const rejected = results.filter((r) => r.status === "rejected");

	expect(fulfilled).toHaveLength(1);
	expect(rejected).toHaveLength(1);

	// The successful request should have attached the product
	const successResult = fulfilled[0] as PromiseFulfilledResult<
		Awaited<ReturnType<typeof autumnV1.attach>>
	>;
	expect(successResult.value.success).toBe(true);
	expect(successResult.value.customer_id).toBe(customerId);
	expect(successResult.value.product_ids).toContain(pro.id);

	// The rejected request should have the duplicate idempotency key error
	const rejectedResult = rejected[0] as PromiseRejectedResult;
	expect(rejectedResult.reason).toBeInstanceOf(AutumnError);
	expect((rejectedResult.reason as AutumnError).code).toBe(
		ErrCode.DuplicateIdempotencyKey,
	);
});
