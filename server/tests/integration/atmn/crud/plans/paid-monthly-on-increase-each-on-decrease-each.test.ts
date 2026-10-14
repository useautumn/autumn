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
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
		}

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
