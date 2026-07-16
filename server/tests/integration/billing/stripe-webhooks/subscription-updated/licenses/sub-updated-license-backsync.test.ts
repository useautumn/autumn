/**
 * TDD contract: customer.subscription.updated auto-sync (back-sync) for
 * license seat quantities.
 *
 * Contract under test:
 *   New behaviors:
 *     - Stripe item quantity 3 -> 4 on the license plan's base price:
 *       pool paid_quantity 3 -> 4, granted/remaining incremented.
 *     - Stripe item quantity 3 -> 2: pool paid_quantity 3 -> 2,
 *       granted/remaining decremented.
 *     - Decrement below seats in use: remaining goes NEGATIVE (truthful
 *       arithmetic, no clamp) and released spare seat rows are expired.
 *     - All of the above hold for a CUSTOMIZED license base price
 *       ($120/yr is_custom definition): quantity syncs converge the pool
 *       without touching the custom definition.
 *     - Entity seat usage survives every quantity sync (balances keep
 *       their tracked usage; seats are never re-provisioned).
 *   Side effects:
 *     - Exactly one pool throughout (quantity changes converge in place —
 *       no duplicate pools, parent stays attached and linked).
 *
 * Pre-impl red: quantity-only license updates never reach the pool —
 * paid_quantity stays at its attach-time value after the Stripe update.
 * Post-impl green: subscription.updated sync maps the license price's
 * quantity delta onto the pool counters.
 */
import { test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV2,
	BillingInterval,
	CusProductStatus,
} from "@autumn/shared";
import { createExternalStripeSubscription } from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import {
	createStripeFixedPriceUnderProduct,
	getBaseStripePriceId,
} from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { expectSpareSeatRowsCorrect } from "@tests/integration/licenses/utils/expectSpareSeatRowsCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { ProductService } from "@/internal/products/ProductService";

const INCLUDED_SEATS = 1;

type AutumnV2_3 = Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];

/** Polls until the customer's single pool matches the expected counters. */
const waitForPoolCounters = async ({
	autumnV2_3,
	customerId,
	licensePlanId,
	parentPlanId,
	paidQuantity,
	usage = 0,
}: {
	autumnV2_3: AutumnV2_3;
	customerId: string;
	licensePlanId: string;
	parentPlanId: string;
	paidQuantity: number;
	usage?: number;
}) => {
	const granted = INCLUDED_SEATS + paidQuantity;
	const deadline = Date.now() + 60_000;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			const customer =
				await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
			expectCustomerLicenses({
				customer,
				count: 1,
				licenses: [
					{
						license_plan_id: licensePlanId,
						parent_plan_id: parentPlanId,
						paid_quantity: paidQuantity,
						granted,
						usage,
						remaining: granted - usage,
					},
				],
			});
			return;
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		}
	}
	throw lastError;
};

const setupLicenseSubscription = async ({
	customerId,
	idPrefix,
	quantity,
	customSeatPrice,
}: {
	customerId: string;
	idPrefix: string;
	quantity: number;
	/** Subscribe via an ad-hoc price on the seat's Stripe product instead of
	 * the catalog base price — back-syncs as a customized license. */
	customSeatPrice?: { amount: number; interval: "month" | "year" };
}) => {
	const parent = products.base({
		id: `${idPrefix}-parent`,
		items: [items.dashboard()],
	});
	const devSeat = products.base({
		id: `${idPrefix}-seat`,
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
		group: `${idPrefix}-licenses`,
	});

	const { autumnV2_3 } = await initScenario({
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
	let seatStripePriceId = getBaseStripePriceId({ fullProduct: seatFull });
	if (customSeatPrice) {
		const seatStripeProductId = seatFull.processor?.id;
		if (!seatStripeProductId) {
			throw new Error("Seat product has no Stripe product id");
		}
		const customStripePrice = await createStripeFixedPriceUnderProduct({
			ctx,
			stripeProductId: seatStripeProductId,
			unitAmount: customSeatPrice.amount * 100,
			interval: customSeatPrice.interval,
		});
		seatStripePriceId = customStripePrice.id;
	}

	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: seatStripePriceId, quantity }],
	});
	const seatItem = subscription.items.data.find(
		(item) => item.price.id === seatStripePriceId,
	);
	if (!seatItem) throw new Error("License subscription item not found");

	// Baseline: sub.created back-sync provisions the pool at `quantity`.
	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: quantity,
	});

	return { autumnV2_3, parent, devSeat, subscription, seatItem };
};

const updateSeatQuantity = async ({
	subscription,
	seatItem,
	quantity,
}: {
	subscription: Stripe.Subscription;
	seatItem: Stripe.SubscriptionItem;
	quantity: number;
}) =>
	ctx.stripeCli.subscriptions.update(subscription.id, {
		items: [{ id: seatItem.id, quantity }],
		proration_behavior: "none",
	});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 1: quantity 3 -> 4 increments the pool
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sub.updated license back-sync: qty 3 -> 4 increments pool paid_quantity")}`, async () => {
	const customerId = "sub-updated-license-backsync-inc";
	const { autumnV2_3, parent, devSeat, subscription, seatItem } =
		await setupLicenseSubscription({
			customerId,
			idPrefix: "lic-backsync-inc",
			quantity: 3,
		});

	await updateSeatQuantity({ subscription, seatItem, quantity: 4 });

	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: 4,
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 2: quantity 3 -> 2 decrements the pool
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sub.updated license back-sync: qty 3 -> 2 decrements pool paid_quantity")}`, async () => {
	const customerId = "sub-updated-license-backsync-dec";
	const { autumnV2_3, parent, devSeat, subscription, seatItem } =
		await setupLicenseSubscription({
			customerId,
			idPrefix: "lic-backsync-dec",
			quantity: 3,
		});

	await updateSeatQuantity({ subscription, seatItem, quantity: 2 });

	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: 2,
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 3: decrement below seats in use → remaining negative, spares expired
// ═══════════════════════════════════════════════════════════════════════════

test(`${chalk.yellowBright("sub.updated license back-sync: decrement below usage goes negative and expires spare seats")}`, async () => {
	const customerId = "sub-updated-license-backsync-overflow";
	const { autumnV2_3, parent, devSeat, subscription, seatItem } =
		await setupLicenseSubscription({
			customerId,
			idPrefix: "lic-backsync-ovf",
			quantity: 3,
		});

	// Fill the pool: 4 bound seats (granted 4 = included 1 + paid 3)...
	await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: devSeat.id,
		entities: [1, 2, 3, 4].map((seatNumber) => ({
			entity_id: `ovf-seat-${seatNumber}`,
			name: `Seat ${seatNumber}`,
			feature_id: TestFeature.Users,
		})),
	});
	await autumnV2_3.track(
		{
			customer_id: customerId,
			entity_id: "ovf-seat-1",
			feature_id: TestFeature.Messages,
			value: 20,
		},
		{ timeout: 2000 },
	);
	// ...then release one, leaving a spare row awaiting reuse (used 3).
	await autumnV2_3.licenses.release({
		customer_id: customerId,
		license_plan_id: devSeat.id,
		entity_ids: ["ovf-seat-4"],
	});
	const poolBefore = await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parent.id,
		isCustom: false,
	});
	await expectSpareSeatRowsCorrect({
		ctx,
		customerLicenseLinkId: poolBefore.link_id,
		count: 1,
		status: CusProductStatus.Active,
	});

	await updateSeatQuantity({ subscription, seatItem, quantity: 1 });

	// paid 3 -> 1: granted 2 < 3 bound seats -> remaining -1 (no clamp).
	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: 1,
		usage: 3,
	});

	// The spare can never rebind while over-allocated — reconcile expired it.
	await expectSpareSeatRowsCorrect({
		ctx,
		customerLicenseLinkId: poolBefore.link_id,
		count: 1,
		status: CusProductStatus.Expired,
	});

	// Bound seats were never re-provisioned — tracked usage survives.
	const seatEntity = await autumnV2_3.entities.get<ApiEntityV2>(
		customerId,
		"ovf-seat-1",
	);
	expectBalanceCorrect({
		customer: seatEntity,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 80,
		usage: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// CASE 4: customized ($120/yr) license base price — quantity syncs converge
// the pool, keep the custom definition, preserve usage, expire spares
// ═══════════════════════════════════════════════════════════════════════════

const CUSTOM_SEAT_PRICE = 120;

test(`${chalk.yellowBright("sub.updated license back-sync: quantity syncs on a customized license price keep definition and usage")}`, async () => {
	const customerId = "sub-updated-license-backsync-custom";
	const { autumnV2_3, parent, devSeat, subscription, seatItem } =
		await setupLicenseSubscription({
			customerId,
			idPrefix: "lic-backsync-cstm-upd",
			quantity: 3,
			customSeatPrice: { amount: CUSTOM_SEAT_PRICE, interval: "year" },
		});

	// Baseline: pool anchored to the is_custom $120/yr definition.
	await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parent.id,
		subscriptionId: subscription.id,
		isCustom: true,
		basePrice: { amount: CUSTOM_SEAT_PRICE, interval: BillingInterval.Year },
	});

	// 4 bound seats, usage tracked on one, one released back as a spare.
	await autumnV2_3.licenses.attach({
		customer_id: customerId,
		plan_id: devSeat.id,
		entities: [1, 2, 3, 4].map((seatNumber) => ({
			entity_id: `cstm-seat-${seatNumber}`,
			name: `Seat ${seatNumber}`,
			feature_id: TestFeature.Users,
		})),
	});
	await autumnV2_3.track(
		{
			customer_id: customerId,
			entity_id: "cstm-seat-1",
			feature_id: TestFeature.Messages,
			value: 20,
		},
		{ timeout: 2000 },
	);
	await autumnV2_3.licenses.release({
		customer_id: customerId,
		license_plan_id: devSeat.id,
		entity_ids: ["cstm-seat-4"],
	});

	// ── Increment 3 -> 5: pool converges, custom definition untouched ────
	await updateSeatQuantity({ subscription, seatItem, quantity: 5 });
	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: 5,
		usage: 3,
	});
	const poolAfterIncrement = await expectLicenseDefinitionCorrect({
		ctx,
		customerId,
		parentPlanId: parent.id,
		isCustom: true,
		basePrice: { amount: CUSTOM_SEAT_PRICE, interval: BillingInterval.Year },
	});

	// ── Overflow decrement 5 -> 1: remaining -1, spare expired ───────────
	await updateSeatQuantity({ subscription, seatItem, quantity: 1 });
	await waitForPoolCounters({
		autumnV2_3,
		customerId,
		licensePlanId: devSeat.id,
		parentPlanId: parent.id,
		paidQuantity: 1,
		usage: 3,
	});
	await expectSpareSeatRowsCorrect({
		ctx,
		customerLicenseLinkId: poolAfterIncrement.link_id,
		count: 1,
		status: CusProductStatus.Expired,
	});

	// ── Usage on bound seats survived both syncs ─────────────────────────
	const seatEntity = await autumnV2_3.entities.get<ApiEntityV2>(
		customerId,
		"cstm-seat-1",
	);
	expectBalanceCorrect({
		customer: seatEntity,
		featureId: TestFeature.Messages,
		granted: 100,
		remaining: 80,
		usage: 20,
	});
});
