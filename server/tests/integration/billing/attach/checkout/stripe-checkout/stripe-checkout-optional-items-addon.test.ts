/**
 * TDD test for provisioning an Autumn add-on purchased via Stripe Checkout's
 * "optional items" upsell.
 *
 * Contract under test:
 *   New behavior:
 *     - `billing.attach` with `checkout_session_params.optional_items`
 *       referencing a Stripe price that matches a configured Autumn add-on
 *       product's price -> when the customer selects that optional item at
 *       checkout, `checkout.session.completed` provisions the matching
 *       add-on as an active customer_product, IN ADDITION to the originally
 *       requested plan.
 *   Side effects:
 *     - Originally requested plan is still provisioned (no regression).
 *     - New customer_product exists for the matched add-on (status active).
 *     - Customer entitlement for the add-on's feature exists.
 *
 * Pre-impl red: the add-on assertions fail because `checkout.session.completed`
 * only provisions what `plan_id` requested — it never inspects the invoice's
 * one-time line items for unrequested-but-matching optional items.
 * Post-impl green: all assertions pass once the checkout handler matches
 * leftover one-time invoice line items against the org's add-on prices and
 * folds any match into the billing plan before executing it.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV1Input } from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

test.concurrent(
	`${chalk.yellowBright("checkout optional_items: purchased add-on is provisioned")}`,
	async () => {
		// Unique per run: Stripe's idempotency cache returns the SAME (already
		// completed) checkout session for a reused customerId, which makes
		// every re-run collide with a prior iteration's completed session.
		const customerId = `checkout-optional-item-addon-${Date.now()}`;

		const pro = products.pro({
			id: "pro-optional-item",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const unfairAdvantage = products.oneOffAddOn({
			id: "unfair-advantage",
			items: [items.dashboard()],
		});

		const { autumnV1, autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }), // clean slate across TDD re-runs
				s.customer({ testClock: true }), // No payment method -> Stripe checkout
				s.products({ list: [pro, unfairAdvantage] }),
			],
			actions: [],
		});

		// The add-on's Stripe price already exists on the org's catalog once
		// `s.products` syncs it — this is what Magica's checkout passes as an
		// `optional_items` entry, independent of what `plan_id` was attached.
		const fullAddOn = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: unfairAdvantage.id,
		});
		const addOnStripePriceId = fullAddOn?.prices[0]?.config?.stripe_price_id as
			| string
			| undefined;
		expect(addOnStripePriceId).toBeDefined();

		// 1. Attach the base plan; offer the add-on as a Checkout optional item.
		const result = await autumnV2_1.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			checkout_session_params: {
				optional_items: [{ price: addOnStripePriceId, quantity: 1 }],
			},
		});

		expect(result.payment_url).toBeDefined();
		expect(result.payment_url).toContain("checkout.stripe.com");

		// 2. Complete checkout, selecting the optional item.
		await completeStripeCheckoutForm({
			url: result.payment_url,
			addOptionalItem: true,
		});
		await timeout(15000);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// ── Contract: originally requested plan still provisions (no regression) ──
		await expectProductActive({ customer, productId: pro.id });

		// ── Contract: the optional item's matching add-on is also provisioned ──
		await expectProductActive({ customer, productId: unfairAdvantage.id });

		// ── Contract: the add-on's entitlement exists on the customer ──
		const dashboardFeature = customer.features?.[TestFeature.Dashboard];
		expect(dashboardFeature).toBeDefined();
	},
);
