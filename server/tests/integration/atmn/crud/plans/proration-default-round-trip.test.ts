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
	type AtmnScenario,
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const prepaidSeats = ({ proration = "" }: { proration?: string } = {}) => `
			{
				featureId: "seats",
				included: 1,
				price: {
					billingMethod: "prepaid",
					interval: "month",
					amount: 10,
					billingUnits: 1,
				},${proration}
			},`;

const DEFAULT_PAIR = `
				proration: { onIncrease: "prorate_immediately", onDecrease: "prorate_immediately" },`;
const CUSTOM_PAIR = `
				proration: { onIncrease: "prorate_next_cycle", onDecrease: "none" },`;

const configText = (scenario: AtmnScenario): string =>
	[...scenario.files().values()].join("\n");

const setItems = (scenario: AtmnScenario, items: string): void =>
	scenario.writeConfig(
		atmnConfigSource({
			body: configBody({ plans: paidMonthly({ items }) }),
		}),
	);

const expectClean = (scenario: AtmnScenario) =>
	scenario
		.wireFromConfig()
		.then((wire) => expectPreviewNone({ client: scenario.client, wire }));

test("prepaid proration: default is never written, a custom pair survives push → pull → push", async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: configBody({
			features: everyFeatureType,
			plans: paidMonthly({ items: prepaidSeats() }),
		}),
	});

	try {
		const untouched = await expectRoundTrip({ scenario });
		expect([...untouched.freshFiles.values()].join("\n")).not.toContain(
			"proration",
		);
		await scenario.pull();
		expect(configText(scenario)).not.toContain("proration");
		await expectClean(scenario);

		setItems(scenario, prepaidSeats({ proration: DEFAULT_PAIR }));
		await scenario.push();
		await expectClean(scenario);
		await scenario.pull();
		expect(configText(scenario)).toContain('onDecrease: "prorate_immediately"');
		await expectClean(scenario);
		const stated = await expectRoundTrip({ scenario });
		expect([...stated.freshFiles.values()].join("\n")).not.toContain(
			"proration",
		);

		setItems(scenario, prepaidSeats({ proration: CUSTOM_PAIR }));
		await scenario.push();
		await expectClean(scenario);
		for (let round = 0; round < 2; round += 1) {
			await scenario.pull();
			expect(configText(scenario)).toContain(
				'onIncrease: "prorate_next_cycle"',
			);
			expect(configText(scenario)).toContain('onDecrease: "none"');
			await scenario.push();
			await expectClean(scenario);
		}
		const custom = await expectRoundTrip({ scenario });
		const fresh = [...custom.freshFiles.values()].join("\n");
		expect(fresh).toContain('onIncrease: "prorate_next_cycle"');
		expect(fresh).toContain('onDecrease: "none"');

		setItems(scenario, prepaidSeats());
		await scenario.push();
		await expectClean(scenario);
		await scenario.pull();
		expect(configText(scenario)).not.toContain("proration");
	} finally {
		scenario.cleanup();
	}
});
