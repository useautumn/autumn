/**
 * Allocated v1 (prorated) volume seats: a seat change invoices now, Autumn pricing old and new
 * totals at their bands. Net tiers 0-10 / 11+ with 3 included are total-seat bands 0-13 / 14+.
 */

import { expect, test } from "bun:test";
import { OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { calculateProration } from "@tests/integration/billing/utils/proration/calculateProration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type Scenario = Awaited<ReturnType<typeof setupVolumeSeats>>;
type VolumeTier = { to: number | "inf"; amount: number; flat_amount?: number };

const BASE_PRICE = 20;
const INCLUDED = 3;
const PRORATE_IMMEDIATELY = {
	on_increase: OnIncrease.ProrateImmediately,
	on_decrease: OnDecrease.ProrateImmediately,
};

const setupVolumeSeats = async ({
	customerId,
	seats = 0,
	tiers,
	prorate = false,
}: {
	customerId: string;
	seats?: number;
	tiers?: VolumeTier[];
	prorate?: boolean;
}) => {
	const seatItem = items.volumeAllocatedUsers({
		includedUsage: INCLUDED,
		tiers,
	});
	const pro = products.pro({
		id: "pro",
		items: [prorate ? { ...seatItem, config: PRORATE_IMMEDIATELY } : seatItem],
	});

	return initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			...(seats > 0
				? [
						s.track({
							featureId: TestFeature.Users,
							value: seats,
							timeout: 3000,
						}),
					]
				: []),
		],
	});
};

const advanceMidCycle = ({ ctx, testClockId, advancedTo }: Scenario) =>
	advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		startingFrom: new Date(advancedTo),
		numberOfDays: 15,
	});

const trackSeats = async ({
	scenario,
	value,
}: {
	scenario: Scenario;
	value: number;
}) => {
	await scenario.autumnV2_2.track({
		customer_id: scenario.customerId,
		feature_id: TestFeature.Users,
		value,
	});
	await timeout(3000);
};

const expectRenewalBillsSeats = async ({
	scenario,
	seatsAmount,
}: {
	scenario: Scenario;
	seatsAmount: number;
}) => {
	const { renewalInvoice } = await expectNextInvoiceMatchesPreview({
		ctx: scenario.ctx,
		autumnV1: scenario.autumnV1,
		autumnV2_2: scenario.autumnV2_2,
		customerId: scenario.customerId,
		testClockId: scenario.testClockId!,
		advancedTo: scenario.advancedTo,
		featureId: TestFeature.Users,
		expectedFeatureAmount: seatsAmount,
	});
	expect(renewalInvoice.total).toBeCloseTo(BASE_PRICE + seatsAmount, 2);
};

test.concurrent(
	`${chalk.yellowBright("allocated-volume-v1 1: 5 → 15 seats mid-cycle prorates $120 − $50, renewal bills 15 × $8 = $120")}`,
	async () => {
		const scenario = await setupVolumeSeats({
			customerId: "alloc-vol-v1-up",
			seats: 5,
			prorate: true,
		});
		const { customerId } = scenario;

		// 5 seats in band 1, full period: 5 × $10 = $50
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 50,
		});

		const midCycle = await advanceMidCycle(scenario);
		await trackSeats({ scenario, value: 10 });

		// Refund 5 × $10, charge 15 × $8 for the rest of the period: prorate($120 − $50)
		const expectedUpgrade = await calculateProration({
			customerId,
			advancedTo: midCycle,
			amount: 120 - 50,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: expectedUpgrade,
		});

		// 15 seats land in band 2 (14+): 15 × $8 = $120
		await expectRenewalBillsSeats({ scenario, seatsAmount: 120 });
	},
);

test.concurrent(
	`${chalk.yellowBright("allocated-volume-v1 2: 15 → 7 seats mid-cycle refunds prorated $120 − $70, renewal bills 7 × $10 = $70")}`,
	async () => {
		const scenario = await setupVolumeSeats({
			customerId: "alloc-vol-v1-down",
			seats: 15,
			prorate: true,
		});
		const { customerId } = scenario;

		// 15 seats in band 2, full period: 15 × $8 = $120
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 120,
		});

		const midCycle = await advanceMidCycle(scenario);
		await trackSeats({ scenario, value: -8 });

		// Refund 15 × $8, charge 7 × $10 for the rest of the period: −prorate($120 − $70)
		const expectedRefund = await calculateProration({
			customerId,
			advancedTo: midCycle,
			amount: 120 - 70,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: -expectedRefund,
		});

		// 7 seats land in band 1 (0-13): 7 × $10 = $70
		await expectRenewalBillsSeats({ scenario, seatsAmount: 70 });
	},
);

test.concurrent(
	`${chalk.yellowBright("allocated-volume-v1 3: tier-1 flat fee, 3 seats bill nothing, the 4th bills 4 × $10 + $5 = $45")}`,
	async () => {
		const scenario = await setupVolumeSeats({
			customerId: "alloc-vol-v1-flat",
			seats: INCLUDED,
			tiers: [
				{ to: 10, amount: 10, flat_amount: 5 },
				{ to: "inf", amount: 8, flat_amount: 2 },
			],
		});
		const { customerId } = scenario;

		// 3 seats ≤ 3 included: only the $20 base invoice
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: BASE_PRICE,
		});

		await trackSeats({ scenario, value: 1 });

		// 4 seats land in band 1, every seat charged: 4 × $10 + $5 flat = $45
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 45,
		});

		await expectRenewalBillsSeats({ scenario, seatsAmount: 45 });
	},
);
