/**
 * atmn crud/plans — billing controls omitted at their default.
 *
 * The server answers with every lane it stores, including the empty ones a
 * dashboard save writes. A pull writes no `billingControls` when no lane has
 * a row, only the lanes that do, and elides each row's spec defaults.
 * Lanes are PATCH on the wire, so an unstated lane is left alone.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	expectPreviewNone,
	expectRoundTrip,
} from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const feature = `
		feature({ featureId: "api", name: "API", type: "metered", consumable: true }),`;

const pro = ({ billingControls }: { billingControls?: string }) => `
		plan({
			planId: "pro",
			name: "Pro",
			price: { amount: 49, interval: "month" },
			items: [{ featureId: "api", included: 100 }],${
				billingControls === undefined
					? ""
					: `\n\t\t\tbillingControls: ${billingControls},`
			}
		}),`;

const EMPTY_LANES = {
	auto_topups: [],
	spend_limits: [],
	usage_limits: [],
	usage_alerts: [],
	overage_allowed: [],
};

test.concurrent(
	"plan billing controls are omitted at their default",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ features: feature, plans: pro({}) }),
		});
		const configFile = () => scenario.files().get("autumn.config.ts") ?? "";
		const setLanes = async (billingControls: Record<string, unknown>) =>
			scenario.client.update({
				plans: [{ plan_id: "pro", billing_controls: billingControls }],
				// biome-ignore lint/suspicious/noExplicitAny: a partial catalog update
			} as any);

		try {
			// Never stated: the scaffold has no billingControls.
			const { freshFiles } = await expectRoundTrip({ scenario });
			expect(freshFiles.get("autumn.config.ts")).not.toContain(
				"billingControls",
			);

			// A dashboard save writes every lane as []: still nothing to pull.
			await setLanes(EMPTY_LANES);
			expect((await scenario.pull()).output).toContain("Nothing to pull.");
			expect(configFile()).not.toContain("billingControls");

			// One lane set elsewhere is unmanaged while unstated: pull is silent
			// and a push leaves it.
			await setLanes({
				...EMPTY_LANES,
				usage_limits: [{ feature_id: "api", limit: 1000, interval: "month" }],
			});
			expect((await scenario.pull()).output).toContain("Nothing to pull.");
			await scenario.push();
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});

			// Stated, the lane is managed. The server's row change patches only
			// that lane, with the row's defaults (enabled: true) left out.
			const header = configFile().split("export default")[0];
			scenario.writeConfig(
				`${header}export default atmn(${configBody({
					features: feature,
					plans: pro({
						billingControls:
							'{ usageLimits: [{ featureId: "api", limit: 1000, interval: "month" }] }',
					}),
				})});\n`,
			);
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
			await setLanes({
				...EMPTY_LANES,
				usage_limits: [{ feature_id: "api", limit: 2000, interval: "month" }],
			});
			expect((await scenario.pull()).output).toContain("~ pro");
			const pulled = configFile();
			expect(pulled).toContain("limit: 2000");
			expect(pulled).not.toContain("enabled");
			expect(pulled).not.toContain("autoTopups");
			expect(pulled).not.toContain("spendLimits");

			// Cleared on the server: the pair goes, not an empty object.
			await setLanes(EMPTY_LANES);
			expect((await scenario.pull()).output).toContain("~ pro");
			expect(configFile()).not.toContain("billingControls");
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
		} finally {
			scenario.cleanup();
		}
	},
);
