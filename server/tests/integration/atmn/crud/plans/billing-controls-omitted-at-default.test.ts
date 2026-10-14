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
			active: true,
			planId: "pro",
			name: "Pro",
			versionSlug: "v1",
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
			const { freshFiles } = await expectRoundTrip({ scenario });
			expect(freshFiles.get("plans.ts")).not.toContain(
				"billingControls",
			);

			await setLanes(EMPTY_LANES);
			expect((await scenario.pull()).output).toContain("Nothing to pull.");
			expect(configFile()).not.toContain("billingControls");

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
