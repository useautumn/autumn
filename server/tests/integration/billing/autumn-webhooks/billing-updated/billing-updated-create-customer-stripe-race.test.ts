/**
 * TDD test for the customer-create webhook race: `billing.updated` fires
 * before the Stripe customer id is persisted.
 *
 * Customer-reported: their signup flow creates a customer with
 * `create_in_stripe: true` plus auto-enabled default products. The create flow
 * fires `billing.updated` right after the Autumn DB transaction (phase 1), but
 * only creates the Stripe customer afterwards (phase 2). A webhook handler that
 * calls `customers.get` on receipt transiently sees `stripe_id: null`.
 *
 * Svix delivery latency makes an end-to-end repro a timing lottery, so this
 * test intercepts the Svix transport boundary (`sendSvixEvent`) in-process and
 * snapshots the customer row at emission time — the invariant under test is
 * "when billing.updated is emitted, the DB already has the Stripe customer id".
 *
 * Red-failure mode (current behavior):
 *  - billing.updated is emitted from executeAutumnCreateCustomerPlan (phase 1),
 *    before setupCreateCustomerBillingContext creates the Stripe customer, so
 *    the emission-time snapshot has processor = null.
 *
 * Green-success criteria (after fix):
 *  - billing.updated is still emitted exactly as before (same payload), but
 *    only after the Stripe customer id is written to the customers row.
 */

import { expect, mock, test } from "bun:test";
import { WebhookEventType } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

type Emission = {
	eventType: string;
	customerId: string | undefined;
	stripeIdAtEmission: string | null;
};

const emissions: Emission[] = [];

const actualSvixHelpers = await import("@/external/svix/svixHelpers.js");

// Intercept the Svix transport so we can observe DB state at emission time.
// Everything upstream (webhook builder, ordering, payload) stays real.
mock.module("@/external/svix/svixHelpers.js", () => ({
	...actualSvixHelpers,
	sendSvixEvent: async ({
		ctx,
		eventType,
		data,
	}: Parameters<typeof actualSvixHelpers.sendSvixEvent>[0]) => {
		const customerId = (data as { customer_id?: string })?.customer_id;

		let stripeIdAtEmission: string | null = null;
		try {
			const { CusService } = await import(
				"@/internal/customers/CusService.js"
			);
			const row = await CusService.get({
				db: ctx.db,
				idOrInternalId: customerId ?? "",
				orgId: ctx.org.id,
				env: ctx.env,
			});
			stripeIdAtEmission = row?.processor?.id ?? null;
		} catch {
			stripeIdAtEmission = null;
		}

		emissions.push({ eventType, customerId, stripeIdAtEmission });
	},
}));

const { createCustomerWithDefaults } = await import(
	"@/internal/customers/actions/createWithDefaults/createCustomerWithDefaults.js"
);

test(`${chalk.yellowBright("billing.updated: create customer with create_in_stripe → stripe id persisted before emission")}`, async () => {
	const customerId = "billing-updated-create-stripe-race";

	const freeDefault = products.base({
		id: "free",
		isDefault: true,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { ctx } = await initScenario({
		setup: [
			s.products({
				list: [freeDefault],
				prefix: customerId,
				customerIdsToDelete: [customerId],
			}),
		],
		actions: [],
	});

	// The reported signup flow: create customer with create_in_stripe while
	// the org has an auto-enabled default product. Called in-process so the
	// mocked Svix boundary observes the emission.
	const fullCustomer = await createCustomerWithDefaults({
		ctx,
		customerId,
		customerData: {
			name: "Stripe Race Test",
			email: `${customerId}@example.com`,
			create_in_stripe: true,
		},
	});

	// Sanity: by the time creation resolves, the Stripe customer exists.
	expect(fullCustomer.processor?.id).toStartWith("cus_");

	// billing.updated is fire-and-forget — poll for its emission.
	const deadline = Date.now() + 10_000;
	let emission: Emission | undefined;
	while (!emission && Date.now() < deadline) {
		emission = emissions.find(
			(e) =>
				e.eventType === WebhookEventType.BillingUpdated &&
				e.customerId === customerId,
		);
		if (!emission) await new Promise((resolve) => setTimeout(resolve, 100));
	}

	// The webhook must still be emitted for the default-product activation…
	expect(emission).toBeDefined();

	// …but only once the Stripe customer id is visible to a customers.get.
	expect(emission?.stripeIdAtEmission).toStartWith("cus_");
});
