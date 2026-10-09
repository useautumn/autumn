/**
 * Allocated v2 (arrear) volume seats: nothing bills mid-cycle; the renewal bills every seat at
 * the band total seats land in. Net tiers 0-10 / 11+ with 3 included are total-seat bands 0-13 / 14+.
 */

import { expect, test } from "bun:test";
import { AllocatedBillingBehavior } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
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
const FLAT_FEE_TIERS: VolumeTier[] = [
	{ to: 10, amount: 10, flat_amount: 5 },
	{ to: "inf", amount: 8, flat_amount: 2 },
];

const setupVolumeSeats = async ({
	customerId,
	seats = 0,
	entitySeats = 0,
	tiers,
}: {
	customerId: string;
	seats?: number;
	entitySeats?: number;
	tiers?: VolumeTier[];
}) => {
	const pro = products.pro({
		id: "pro",
		items: [
			items.volumeAllocatedUsers({
				includedUsage: INCLUDED,
				tiers,
				allocatedBillingBehavior: AllocatedBillingBehavior.Arrear,
			}),
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			...(entitySeats > 0
				? [s.entities({ count: entitySeats, featureId: TestFeature.Users })]
				: []),
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

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 1,
		latestTotal: BASE_PRICE,
	});

	return scenario;
};

const advanceMidCycle = async ({ ctx, testClockId, advancedTo }: Scenario) => {
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		startingFrom: new Date(advancedTo),
		numberOfDays: 15,
	});
};

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

/** Arrear seats never invoice mid-cycle; the renewal matches the preview and bills the band. */
const expectRenewalBillsSeats = async ({
	scenario,
	seatsAmount,
}: {
	scenario: Scenario;
	seatsAmount: number;
}) => {
	await expectCustomerInvoiceCorrect({
		customerId: scenario.customerId,
		count: 1,
		latestTotal: BASE_PRICE,
	});

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
	`${chalk.yellowBright("allocated-volume-v2 1: 5 → 15 seats mid-cycle crosses into band 2: 15 × $8 = $120 at renewal")}`,
	async () => {
		const scenario = await setupVolumeSeats({
			customerId: "alloc-vol-v2-up",
			seats: 5,
		});

		await advanceMidCycle(scenario);
		await trackSeats({ scenario, value: 10 });

		// 15 seats land in band 2 (14+): 15 × $8 = $120
		await expectRenewalBillsSeats({ scenario, seatsAmount: 120 });
	},
);

test.concurrent(
	`${chalk.yellowBright("allocated-volume-v2 2: 15 → 7 seats mid-cycle drops back to band 1: 7 × $10 = $70 at renewal")}`,
	async () => {
		const scenario = await setupVolumeSeats({
			customerId: "alloc-vol-v2-down",
			seats: 15,
		});

		await advanceMidCycle(scenario);
		await trackSeats({ scenario, value: -8 });

		// 7 seats land in band 1 (0-13): 7 × $10 = $70
		await expectRenewalBillsSeats({ scenario, seatsAmount: 70 });
	},
);

test.concurrent(
	`${chalk.yellowBright("allocated-volume-v2 3: tier-1 flat fee, 3 seats = included → $0")}`,
	async () => {
		const scenario = await setupVolumeSeats({
			customerId: "alloc-vol-v2-flat-included",
			seats: INCLUDED,
			tiers: FLAT_FEE_TIERS,
		});

		// 3 seats ≤ 3 included: no seat charge and no flat fee
		await expectRenewalBillsSeats({ scenario, seatsAmount: 0 });
	},
);

test.concurrent(
	`${chalk.yellowBright("allocated-volume-v2 4: tier-1 flat fee, 4 seats → 4 × $10 + $5 = $45")}`,
	async () => {
		const scenario = await setupVolumeSeats({
			customerId: "alloc-vol-v2-flat-past-included",
			seats: INCLUDED + 1,
			tiers: FLAT_FEE_TIERS,
		});

		// 4 seats land in band 1, every seat charged: 4 × $10 + $5 flat = $45
		await expectRenewalBillsSeats({ scenario, seatsAmount: 45 });
	},
);

test.concurrent(
	`${chalk.yellowBright("allocated-volume-v2 5: 15 entity seats, delete 8 mid-cycle → band 1: 7 × $10 = $70")}`,
	async () => {
		const scenario = await setupVolumeSeats({
			customerId: "alloc-vol-v2-entities-down",
			entitySeats: 15,
		});

		await advanceMidCycle(scenario);
		for (const entity of scenario.entities.slice(0, 8)) {
			await scenario.autumnV1.entities.delete(scenario.customerId, entity.id);
		}
		await timeout(3000);

		// 15 → 7 seats moves from band 2 back to band 1: 7 × $10 = $70
		await expectRenewalBillsSeats({ scenario, seatsAmount: 70 });
	},
);
