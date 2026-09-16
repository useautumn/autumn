/**
 * atmn crud/plans — proration at its default is not written by pull; any
 * other pair survives push → pull → push untouched.
 *
 * The server reads an omitted proration block as
 * { on_increase: prorate_immediately, on_decrease: prorate_immediately } (the
 * pair it stores for a prepaid item that never set one), so a pull that
 * leaves the block out and a config that states that pair mean the same thing.
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

/** The server's own preview finds nothing to apply for the config on disk. */
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
		// 1. An item that never touched proration: the round trip writes none.
		const untouched = await expectRoundTrip({ scenario });
		expect([...untouched.freshFiles.values()].join("\n")).not.toContain(
			"proration",
		);
		await scenario.pull();
		expect(configText(scenario)).not.toContain("proration");
		await expectClean(scenario);

		// 2. The default pair stated by hand previews clean, so an in-place pull
		// leaves the text alone (it rewrites only what differs); a fresh pull
		// writes no block, and the config without one previews clean too.
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

		// 3. A custom pair: push → pull → push → pull, present and unchanged
		// at every step.
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

		// 4. Removing the block by hand puts the item back on the default: the
		// server sees a change, applies it, and the next pull writes nothing.
		setItems(scenario, prepaidSeats());
		await scenario.push();
		await expectClean(scenario);
		await scenario.pull();
		expect(configText(scenario)).not.toContain("proration");
	} finally {
		scenario.cleanup();
	}
});
