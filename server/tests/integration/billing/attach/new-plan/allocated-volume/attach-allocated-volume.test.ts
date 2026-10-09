/**
 * Allocated Volume Seats (prorated allocated, priced by Stripe at renewal)
 *
 * Volume follows the prepaid rule: the band is picked from total seats, and
 * once total seats pass the included amount every seat (included ones too) is
 * charged at that band's rate plus its flat_amount. At or below the included
 * amount nothing is charged.
 *
 * Allocated seats are Stripe-priced: the subscription item quantity is total
 * seats against a volume price with a free first tier [0..included] @ $0.
 *
 * Volume on allocated items is still gated, so the fixture creates a graduated
 * allocated item and flips its price row to volume before anything is minted.
 *
 * Seats (3 included). Stored tiers are net of included; in total seats:
 *   0–3   free
 *   4–8   @ $10/seat + $5 flat
 *   9+    @ $6/seat  + $2 flat
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ProductItem,
	TierBehavior,
	type UsagePriceConfig,
	type UsageTier,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { getUsersPrice } from "@tests/integration/crud/plans/utils/allocatedV1Utils";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";

type TestCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

const BASE_PRICE = 20;
const INCLUDED = 3;
const NET_VOLUME_TIERS: UsageTier[] = [
	{ to: 5, amount: 10, flat_amount: 5 },
	{ to: -1, amount: 6, flat_amount: 2 },
];

const seatsCost = (seats: number) => {
	if (seats <= INCLUDED) return 0;
	if (seats <= INCLUDED + 5) return seats * 10 + 5;
	return seats * 6 + 2;
};

const allocatedSeatsItem = (): ProductItem => ({
	...constructArrearProratedItem({
		featureId: TestFeature.Users,
		includedUsage: INCLUDED,
	}),
	price: null,
	tiers: [
		{ to: 5, amount: 10 },
		{ to: "inf", amount: 6 },
	],
});

/** Flips the plan's seat price to volume (with tier flat fees) while it has no Stripe price yet. */
const setVolumeSeatTiers = async ({
	ctx,
	planId,
}: {
	ctx: TestCtx;
	planId: string;
}) => {
	const price = await getUsersPrice({ ctx, planId });
	await PriceService.update({
		db: ctx.db,
		id: price.id,
		update: {
			tier_behavior: TierBehavior.VolumeBased,
			config: {
				...(price.config as UsagePriceConfig),
				usage_tiers: NET_VOLUME_TIERS,
			},
		},
	});
};

const expectVolumeSeatStripePrice = async ({
	ctx,
	planId,
}: {
	ctx: TestCtx;
	planId: string;
}) => {
	const price = await getUsersPrice({ ctx, planId });
	const stripePriceId = (price.config as UsagePriceConfig).stripe_price_id;
	expect(stripePriceId).toBeTruthy();

	const stripePrice = await ctx.stripeCli.prices.retrieve(stripePriceId!, {
		expand: ["tiers"],
	});
	expect(stripePrice.tiers_mode).toBe("volume");
	expect(
		stripePrice.tiers?.map((tier) => ({
			up_to: tier.up_to,
			unit_amount: tier.unit_amount,
			flat_amount: tier.flat_amount,
		})),
	).toEqual([
		{ up_to: INCLUDED, unit_amount: 0, flat_amount: null },
		{ up_to: INCLUDED + 5, unit_amount: 1000, flat_amount: 500 },
		{ up_to: null, unit_amount: 600, flat_amount: 200 },
	]);
};

const setupVolumeSeats = async ({
	customerId,
	seats,
}: {
	customerId: string;
	seats: number;
}) => {
	const pro = products.pro({ id: "pro", items: [allocatedSeatsItem()] });

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro], createInStripe: false }),
			...(seats > 0
				? [s.entities({ count: seats, featureId: TestFeature.Users })]
				: []),
		],
		actions: [],
	});

	await setVolumeSeatTiers({ ctx: scenario.ctx, planId: pro.id });

	return { ...scenario, pro };
};

const createSeats = async ({
	autumn,
	customerId,
	from,
	count,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	customerId: string;
	from: number;
	count: number;
}) => {
	await autumn.entities.create(
		customerId,
		Array.from({ length: count }, (_, index) => ({
			id: `seat-${from + index}`,
			name: `Seat ${from + index}`,
			feature_id: TestFeature.Users,
		})),
	);
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: 0 seats, then up to the included amount → seats cost $0
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("allocated-volume 1: 0 seats and at included cost $0, Stripe price is volume with a free tier")}`,
	async () => {
		const customerId = "allocated-volume-included";
		const { autumnV1, ctx, pro, testClockId, advancedTo } =
			await setupVolumeSeats({ customerId, seats: 0 });

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
		});
		expect(preview.total).toBe(BASE_PRICE);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		await expectVolumeSeatStripePrice({ ctx, planId: pro.id });
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: BASE_PRICE,
		});

		await createSeats({
			autumn: autumnV1,
			customerId,
			from: 1,
			count: INCLUDED,
		});
		await expectCustomerInvoiceCorrect({ customerId, count: 1 });
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: BASE_PRICE + seatsCost(INCLUDED),
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: included + 1, then crossing into the next band
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("allocated-volume 2: included + 1 charges every seat plus the band fee, crossing a band re-prices all seats; preview = invoice")}`,
	async () => {
		const customerId = "allocated-volume-bands";
		const startSeats = INCLUDED + 1;
		const endSeats = INCLUDED + 6;
		const { autumnV1, ctx, pro, testClockId, advancedTo } =
			await setupVolumeSeats({ customerId, seats: startSeats });

		// 4 seats land in the $10 band: 4 × $10 + $5 = $45
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
		});
		expect(preview.total).toBe(BASE_PRICE + seatsCost(startSeats));

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: preview.total,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		// 9 seats land in the $6 band: 9 × $6 + $2 = $56, so the increase bills $56 − $45
		await createSeats({
			autumn: autumnV1,
			customerId,
			from: startSeats + 1,
			count: endSeats - startSeats,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: seatsCost(endSeats) - seatsCost(startSeats),
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 3,
			latestTotal: BASE_PRICE + seatsCost(endSeats),
		});
	},
);
