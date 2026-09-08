/**
 * atmn crud/plans — paid [monthly] [on_increase: each] × [on_decrease: each]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import {
	configBody,
	everyFeatureType,
	paidMonthly,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	expectPreviewNone,
	expectRoundTrip,
} from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const ON_INCREASE = [
	"bill_immediately",
	"prorate_immediately",
	"prorate_next_cycle",
	"bill_next_cycle",
] as const;
const ON_DECREASE = [
	"prorate",
	"prorate_immediately",
	"prorate_next_cycle",
	"none",
	"no_prorations",
] as const;

/** bill_immediately isn't supported on a prepaid item price — every other
 * on_increase is valid, so it's asserted separately as a clean rejection. */
const SUPPORTED_ON_INCREASE = ON_INCREASE.filter(
	(onIncrease) => onIncrease !== "bill_immediately",
);

const VALID_COMBOS = SUPPORTED_ON_INCREASE.flatMap((onIncrease) =>
	ON_DECREASE.map((onDecrease) => ({ onIncrease, onDecrease })),
);

const prepaidSeatItem = ({
	onIncrease,
	onDecrease,
}: {
	onIncrease: string;
	onDecrease: string;
}): string => `
			{
				featureId: "seats",
				included: 1,
				price: {
					billingMethod: "prepaid",
					interval: "month",
					amount: 10,
					billingUnits: 1,
				},
				proration: { onIncrease: "${onIncrease}", onDecrease: "${onDecrease}" },
			},`;

test("paid [monthly] proration: every on_increase × on_decrease combination", async () => {
	// One scenario, one plan reused in place for the whole matrix — a fresh
	// org (or a fresh Stripe-backed plan) per cell hits real limits at this
	// cell count.
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: configBody({
			features: everyFeatureType,
			plans: paidMonthly({ items: prepaidSeatItem(VALID_COMBOS[0]) }),
		}),
	});

	try {
		// Round trip on the first combo, before any further in-place mutation
		// piles up — proves push/pull stay consistent for a proration item.
		await expectRoundTrip({ scenario });

		for (const { onIncrease, onDecrease } of VALID_COMBOS) {
			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						plans: paidMonthly({
							items: prepaidSeatItem({ onIncrease, onDecrease }),
						}),
					}),
				}),
			);
			await scenario.push();
			// A clean preview right after push proves the server stored exactly
			// this on_increase/on_decrease pair, not just that push succeeded.
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
		}

		// bill_immediately is rejected outright on a prepaid item, for every
		// on_decrease — a direct rejection, not a round trip.
		for (const onDecrease of ON_DECREASE) {
			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						plans: paidMonthly({
							items: prepaidSeatItem({
								onIncrease: "bill_immediately",
								onDecrease,
							}),
						}),
					}),
				}),
			);
			await expect(scenario.push()).rejects.toThrow(
				/Bill immediately is not supported for prepaid/,
			);
		}
	} finally {
		scenario.cleanup();
	}
});
