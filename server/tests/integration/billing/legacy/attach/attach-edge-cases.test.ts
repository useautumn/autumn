import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

test.concurrent(
	`${chalk.yellowBright("attach: alipay payment method returns checkout_url")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const { customerId, autumnV1 } = await initScenario({
			customerId: "alipay-attach-1",
			setup: [
				s.customer({ withDefault: false, paymentMethod: "alipay" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		// Attach pro with alipay - should return checkout_url since alipay requires redirect
		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(res.checkout_url).toBeDefined();
		expect(res.checkout_url).toContain("checkout.stripe.com");
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Create customer and entity with null IDs (autumn_id generation)
// (from others6)
//
// Scenario:
// - Create customer with id=null → gets autumn_id
// - Create entity with id=null → gets autumn_id
// - Attach pro product with invoice option
// - Then assign external ID to the same customer
//
// Expected:
// - Customer and entity get autumn_id when created with null
// - Can attach product using autumn_id
// - Can later assign external ID to same customer
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("attach-edge-case 3: null customer_id and entity_id (autumn_id generation)")}`,
	async () => {
		const customerId = "edge-case-null-ids";
		const email = `${customerId}@test.com`;

		const wordsItem = items.consumableWords();
		const pro = products.pro({
			id: "pro",
			items: [wordsItem],
		});

		// Clean up any existing customer with this email
		const existingCustomers = await CusService.getByEmail({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			email,
		});

		const { autumnV1 } = await initScenario({
			setup: [s.products({ list: [pro], prefix: customerId })],
			actions: [],
		});

		if (existingCustomers.length > 0) {
			await autumnV1.customers.delete(existingCustomers[0].internal_id);
		}

		// Create customer with id=null → should get autumn_id
		const customer = await autumnV1.customers.create({
			id: null,
			email,
			name: customerId,
			withAutumnId: true,
		});

		expect(customer.autumn_id).toBeDefined();
		const internalCustomerId = customer.autumn_id;

		// Create entity with id=null → should get autumn_id
		const entity = await autumnV1.entities.create(internalCustomerId, {
			id: null,
			feature_id: TestFeature.Users,
		});

		expect(entity.autumn_id).toBeDefined();
		const internalEntityId = entity.autumn_id;

		// Attach pro product using autumn_ids, with invoice option
		await autumnV1.attach({
			customer_id: internalCustomerId,
			entity_id: internalEntityId,
			product_id: pro.id,
			invoice: true,
			enable_product_immediately: true,
		});

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(internalCustomerId);

		// The balance worker doesn't aggregate entity data onto the customer.
		if (!isBalanceWorkerRoute()) {
			await expectCustomerProducts({
				customer: customerAfterAttach,
				active: [pro.id],
			});
		}

		expect(customerAfterAttach.invoices?.length).toBe(1);
		expect(customerAfterAttach.invoices?.[0].status).toBe("draft");

		// Now assign external ID to the same customer
		const customerWithId = await autumnV1.customers.create({
			id: customerId,
			email,
		});

		// Should be the same customer (same autumn_id)
		expect(customerWithId.autumn_id).toBe(internalCustomerId);

		// Can now fetch by external ID
		const customerById =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// The balance worker doesn't aggregate entity data onto the customer.
		if (!isBalanceWorkerRoute()) {
			await expectCustomerProducts({
				customer: customerById,
				active: [pro.id],
			});
		}
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Duplicate attach error (attach same product twice)
// (from others9)
//
// Scenario:
// - Free product with Words feature
// - Attach free product → success
// - Attach same free product again → error
//
// Expected:
// - First attach succeeds
// - Second attach throws AutumnError
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("attach-edge-case 4: duplicate attach error")}`,
	async () => {
		const customerId = "edge-case-duplicate-attach";

		const wordsItem = items.monthlyWords({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			items: [wordsItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [free] }),
			],
			actions: [],
		});

		// First attach should succeed
		await autumnV1.attach({
			customer_id: customerId,
			product_id: free.id,
		});

		const customerAfterFirstAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterFirstAttach,
			active: [free.id],
		});

		// Second attach should fail
		await expectAutumnError({
			func: async () => {
				await autumnV1.attach({
					customer_id: customerId,
					product_id: free.id,
				});
			},
		});
	},
);
