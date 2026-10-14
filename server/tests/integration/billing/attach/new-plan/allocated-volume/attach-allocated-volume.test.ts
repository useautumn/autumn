import { expect, test } from "bun:test";
import type { ApiCustomerV3, UsagePriceConfig } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { getUsersPrice } from "@tests/integration/crud/plans/utils/allocatedV1Utils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type TestCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

const BASE_PRICE = 20;
const INCLUDED = 3;

const seatsCost = (seats: number) => {
	const overage = seats - INCLUDED;
	if (overage <= 0) return 0;
	if (overage <= 5) return overage * 10;
	return overage * 6 + 2;
};

const allocatedSeatsItem = () =>
	items.volumeAllocatedUsers({
		includedUsage: INCLUDED,
		tiers: [
			{ to: 5, amount: 10 },
			{ to: "inf", amount: 6, flat_amount: 2 },
		],
	});

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
		{ up_to: 5, unit_amount: 1000, flat_amount: null },
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
			s.products({ list: [pro] }),
			...(seats > 0
				? [s.entities({ count: seats, featureId: TestFeature.Users })]
				: []),
		],
		actions: [],
	});

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

test.concurrent(
	`${chalk.yellowBright("allocated-volume 1: 0 seats and at included cost $0, Stripe price is volume on net tiers with no free tier")}`,
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

test.concurrent(
	`${chalk.yellowBright("allocated-volume 2: included + 1 charges only the seat over, crossing a net band re-prices the overage plus its fee; preview = invoice")}`,
	async () => {
		const customerId = "allocated-volume-bands";
		const startSeats = INCLUDED + 1;
		const endSeats = INCLUDED + 6;
		const { autumnV1, ctx, pro, testClockId, advancedTo } =
			await setupVolumeSeats({ customerId, seats: startSeats });

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
