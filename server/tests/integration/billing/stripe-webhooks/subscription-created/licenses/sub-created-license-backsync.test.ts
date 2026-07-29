/**
 * TDD contract: customer.subscription.created auto-sync (back-sync) for
 * license plans.
 *
 * Contract under test:
 *   New behaviors:
 *     - CASE 1 (stock): an external Stripe sub carrying 3 × the LICENSE
 *       plan's catalog base price back-syncs as the PARENT plan attached
 *       (the plan whose catalog links offer this license), NOT as the
 *       license plan itself.
 *     - CASE 2 (custom): an external Stripe sub carrying 2 × an ad-hoc
 *       $120/yr price on the LICENSE plan's Stripe product back-syncs as
 *       the parent attached with a CUSTOMIZED license (is_custom plan
 *       license whose base price is $120/yr).
 *   Side effects:
 *     - customer_licenses pool created under the parent customer product:
 *       paid_quantity = Stripe item quantity, granted = included + paid,
 *       remaining = granted (no assignments yet).
 *     - Parent customer product linked to the Stripe subscription.
 *
 * Pre-impl red: auto-sync matches the license product directly and either
 * attaches it as a standalone plan or skips — no parent attach, no pool.
 * The imported custom price also lost its source config.stripe_price_id.
 * Post-impl green: sync detection resolves license prices to the owning
 * parent link, provisions the pool, and persists the source Stripe price ID
 * on prices flowing through customize.upsert_licenses.
 */
import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	BillingInterval,
} from "@autumn/shared";
import { createExternalStripeSubscription } from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import {
	createStripeFixedPriceUnderProduct,
	getBaseStripePriceId,
} from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

const INCLUDED_SEATS = 1;
const PAID_SEATS = 3;

test(`${chalk.yellowBright("sub.created license back-sync: 3x license price attaches parent with paid pool")}`, async () => {
	const customerId = "sub-created-license-backsync";

	const parent = products.base({
		id: "lic-backsync-parent",
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: "lic-backsync-seat",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
		group: "lic-backsync-licenses",
	});

	const { autumnV1, autumnV2_3 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [parent, devSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: devSeat.id,
				included: INCLUDED_SEATS,
			}),
		],
	});

	const seatFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: devSeat.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const stripeSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [
			{
				price: getBaseStripePriceId({ fullProduct: seatFull }),
				quantity: PAID_SEATS,
			},
		],
	});
	expect(stripeSubscription.status).toBe("active");

	await timeout(12_000);

	// ── Contract: PARENT attached (not the license plan itself) ──────────
	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerV3, productId: parent.id });

	// ── Contract: pool paid_quantity 3, granted = included + 3 ───────────
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: devSeat.id,
				parent_plan_id: parent.id,
				paid_quantity: PAID_SEATS,
				granted: INCLUDED_SEATS + PAID_SEATS,
				usage: 0,
				remaining: INCLUDED_SEATS + PAID_SEATS,
			},
		],
	});

	// ── Side effects: sub linked + pool anchored to the CATALOG license ──
	await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parent.id,
		subscriptionId: stripeSubscription.id,
		isCustom: false,
		basePrice: { amount: 20, interval: BillingInterval.Month },
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 2: custom $120/yr price on the license product → customized license
// ═══════════════════════════════════════════════════════════════════════════

const CUSTOM_SEAT_PRICE = 120;
const CUSTOM_PAID_SEATS = 2;

test(`${chalk.yellowBright("sub.created license back-sync: custom $120/yr license price attaches parent with customized license")}`, async () => {
	const customerId = "sub-created-license-backsync-custom";

	const parent = products.base({
		id: "lic-backsync-cstm-parent",
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: "lic-backsync-cstm-seat",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
		group: "lic-backsync-cstm-licenses",
	});

	const { autumnV1, autumnV2_3 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [parent, devSeat] }),
		],
		actions: [
			s.licenses.link({
				parentProductId: parent.id,
				licenseProductId: devSeat.id,
				included: INCLUDED_SEATS,
			}),
		],
	});

	const seatFull = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: devSeat.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const seatStripeProductId = seatFull.processor?.id;
	if (!seatStripeProductId) {
		throw new Error("Seat product has no Stripe product id");
	}

	// An ad-hoc price on the seat's Stripe product Autumn knows nothing about.
	const customStripePrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: seatStripeProductId,
		unitAmount: CUSTOM_SEAT_PRICE * 100,
		interval: "year",
	});

	const stripeSubscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: customStripePrice.id, quantity: CUSTOM_PAID_SEATS }],
	});
	expect(stripeSubscription.status).toBe("active");

	await timeout(12_000);

	// ── Contract: PARENT attached (not the license plan itself) ──────────
	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerV3, productId: parent.id });

	// ── Contract: pool paid_quantity 2, granted = included + 2 ───────────
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expectCustomerLicenses({
		customer,
		count: 1,
		licenses: [
			{
				license_plan_id: devSeat.id,
				parent_plan_id: parent.id,
				paid_quantity: CUSTOM_PAID_SEATS,
				granted: INCLUDED_SEATS + CUSTOM_PAID_SEATS,
				usage: 0,
				remaining: INCLUDED_SEATS + CUSTOM_PAID_SEATS,
			},
		],
	});

	// ── Side effects: sub linked + pool anchored to an is_custom license
	//    definition carrying the $120/yr base price ───────────────────────
	await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parent.id,
		subscriptionId: stripeSubscription.id,
		isCustom: true,
		basePrice: {
			amount: CUSTOM_SEAT_PRICE,
			interval: BillingInterval.Year,
			stripePriceId: customStripePrice.id,
		},
	});
});
