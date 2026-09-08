/**
 * atmn crud/settings — a flag the catalog depends on, pushed in one go.
 *
 * multi_currency gates additional currencies: the settings lane applies first
 * so the catalog is previewed against the org as it will be, and the same
 * config that turns the flag on may carry the EUR price that needs it.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const euroPro = `
		plan({
			planId: "pro",
			name: "Pro",
			price: {
				amount: 49,
				interval: "month",
				additionalCurrencies: [{ currency: "eur", amount: 45 }],
			},
			items: [],
		}),`;

test.concurrent(
	"settings then dependent catalog: multiCurrency and a EUR price in one push",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: configBody({ plans: euroPro, settings: "multiCurrency: true" }),
		});

		try {
			// A dry run cannot apply the flag, so the catalog preview still runs
			// against the org as it is: the error is the server's, not a hang.
			await expect(scenario.push({ dryRun: true })).rejects.toThrow(
				/\/v1\/catalogV2\.preview_update failed \(400\)/,
			);

			const { output } = await scenario.push();
			expect(output).toContain("~ Multi-currency: false -> true");
			expect(output).toContain("Applied settings.");
			expect(output).toContain("+ pro");
			expect(output).toContain("Applied.");

			const { freshWire } = await expectRoundTrip({ scenario });
			expect(freshWire.settings).toEqual({ multi_currency: true });
		} finally {
			scenario.cleanup();
		}
	},
);
