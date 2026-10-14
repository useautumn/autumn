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

		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(res.checkout_url).toBeDefined();
		expect(res.checkout_url).toContain("checkout.stripe.com");
	},
);

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

		const customer = await autumnV1.customers.create({
			id: null,
			email,
			name: customerId,
			withAutumnId: true,
		});

		expect(customer.autumn_id).toBeDefined();
		const internalCustomerId = customer.autumn_id;

		const entity = await autumnV1.entities.create(internalCustomerId, {
			id: null,
			feature_id: TestFeature.Users,
		});

		expect(entity.autumn_id).toBeDefined();
		const internalEntityId = entity.autumn_id;

		await autumnV1.attach({
			customer_id: internalCustomerId,
			entity_id: internalEntityId,
			product_id: pro.id,
			invoice: true,
			enable_product_immediately: true,
		});

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(internalCustomerId);

		if (!isBalanceWorkerRoute()) {
			await expectCustomerProducts({
				customer: customerAfterAttach,
				active: [pro.id],
			});
		}

		expect(customerAfterAttach.invoices?.length).toBe(1);
		expect(customerAfterAttach.invoices?.[0].status).toBe("draft");

		const customerWithId = await autumnV1.customers.create({
			id: customerId,
			email,
		});

		expect(customerWithId.autumn_id).toBe(internalCustomerId);

		const customerById =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		if (!isBalanceWorkerRoute()) {
			await expectCustomerProducts({
				customer: customerById,
				active: [pro.id],
			});
		}
	},
);

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
