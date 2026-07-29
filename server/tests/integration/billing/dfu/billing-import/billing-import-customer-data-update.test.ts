/**
 * billing.import — `customer_data` must update an EXISTING customer's identity
 * fields (name, email, fingerprint), and invalid emails must be rejected with
 * the same validation as the normal customer paths, not persisted.
 *
 * Red (pre-fix): upsertFullCustomer only read customer_data on the create path,
 * so fields sent for an existing customer were silently dropped; any string was
 * accepted as an email and written through to the customer.
 * Green: all three fields reflect the imported customer_data; a malformed
 * email fails validation and leaves the stored email untouched.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import {
	callFlash,
	type FlashClient,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const freePlanPayload = ({
	customerId,
	planId,
	customerData,
}: {
	customerId: string;
	planId: string;
	customerData: Record<string, string>;
}) => ({
	customer_id: customerId,
	customer_data: customerData,
	billables: [
		{
			plan: {
				plan_id: planId,
				status: "active",
				started_at: Date.now() - 1000 * 60 * 60 * 24 * 30,
				balances: [{ feature_id: TestFeature.Messages, usage: 10 }],
			},
		},
	],
});

test.concurrent(
	`${chalk.yellowBright("billing.import: customer_data updates an existing customer's name, email and fingerprint")}`,
	async () => {
		const customerId = "dfu-flash-cusdata-update";
		const free = products.base({
			id: "dfu-cusdata-free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					name: "Old Name",
					email: "old-cusdata@example.com",
					data: { fingerprint: "old-fingerprint" },
				}),
				s.products({ list: [free] }),
			],
			actions: [],
		});

		const flashRes = await callFlash(
			autumnV2_2 as FlashClient,
			freePlanPayload({
				customerId,
				planId: free.id,
				customerData: {
					name: "Stripe Test",
					email: "stripetest@gmail.com",
					fingerprint: "new-fingerprint",
				},
			}),
		);
		expect(flashRes.errorCode).toBeNull();

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.name).toBe("Stripe Test");
		expect(customer.email).toBe("stripetest@gmail.com");
		expect(customer.fingerprint).toBe("new-fingerprint");
	},
);

test.concurrent(
	`${chalk.yellowBright("billing.import: dry_run does not persist customer_data updates")}`,
	async () => {
		const customerId = "dfu-flash-cusdata-dry-run";
		const free = products.base({
			id: "dfu-cusdata-dry-run-free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					name: "Dry Run Name",
					email: "dry-run@example.com",
					data: { fingerprint: "old-dry-run-fingerprint" },
				}),
				s.products({ list: [free] }),
			],
			actions: [],
		});

		const flashRes = await callFlash(autumnV2_2 as FlashClient, {
			...freePlanPayload({
				customerId,
				planId: free.id,
				customerData: {
					name: "Should Not Persist",
					email: "nope@example.com",
					fingerprint: "new-dry-run-fingerprint",
				},
			}),
			dry_run: true,
		});
		expect(flashRes.errorCode).toBeNull();

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.name).toBe("Dry Run Name");
		expect(customer.email).toBe("dry-run@example.com");
		expect(customer.fingerprint).toBe("old-dry-run-fingerprint");
	},
);

test.concurrent(
	`${chalk.yellowBright("billing.import: invalid customer_data email is rejected, not persisted")}`,
	async () => {
		const customerId = "dfu-flash-cusdata-bad-email";
		const free = products.base({
			id: "dfu-cusdata-bad-email-free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, email: "valid-cusdata@example.com" }),
				s.products({ list: [free] }),
			],
			actions: [],
		});

		const flashRes = await callFlash(
			autumnV2_2 as FlashClient,
			freePlanPayload({
				customerId,
				planId: free.id,
				customerData: { email: "not-an-email" },
			}),
		);
		expect(flashRes.errorMessage).toContain("email");

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.email).toBe("valid-cusdata@example.com");
	},
);

test.concurrent(
	`${chalk.yellowBright("billing.import: dry_run does not persist processor identity updates")}`,
	async () => {
		const customerId = "dfu-flash-processor-dry-run";
		const free = products.base({
			id: "dfu-processor-dry-run-free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					name: "Processor Test",
					email: "processor-test@example.com",
				}),
				s.products({ list: [free] }),
			],
			actions: [],
		});

		// First, verify customer has no RevenueCat processor
		const customerBefore = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
		);
		expect(customerBefore.processors?.revenuecat?.id).toBeUndefined();

		// Try to add RevenueCat processor in dry_run mode
		const flashRes = await callFlash(autumnV2_2 as FlashClient, {
			...freePlanPayload({
				customerId,
				planId: free.id,
				customerData: {},
			}),
			processors: [{ type: "revenuecat", id: "rc-test-user-id" }],
			dry_run: true,
		});
		expect(flashRes.errorCode).toBeNull();

		// Verify processor was NOT persisted
		const customerAfter = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
		);
		expect(customerAfter.processors?.revenuecat?.id).toBeUndefined();
	},
);
