/**
 * atmn crud/plans — a stated config is the complete set of flags.
 *
 * Omitted config stays unmanaged (config-omitted-at-default.test.ts); a stated
 * `{}` or partial object turns every flag it does not list off.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectPreviewNone } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const pro = ({ config }: { config?: string }) => `
		plan({
			active: true,
			planId: "pro",
			name: "Pro",
			versionSlug: "v1",
			price: { amount: 49, interval: "month" },${
				config === undefined ? "" : `\n\t\t\tconfig: ${config},`
			}
			items: [],
		}),`;

type Catalog = { plans: Array<Record<string, unknown>> };
type PreviewRow = { action?: string } & Record<string, unknown>;

test.concurrent(
	"a stated empty config resets flags set elsewhere",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ plans: pro({}) }),
		});
		const proConfig = async () =>
			((await scenario.client.get({})) as Catalog).plans.find(
				(plan) => plan.id === "pro",
			)?.config;
		const configFile = () => scenario.files().get("autumn.config.ts") ?? "";
		const rewrite = ({ config }: { config?: string }) =>
			scenario.writeConfig(
				`${configFile().split("export default")[0]}export default atmn(${configBody(
					{ plans: pro({ config }) },
				)});\n`,
			);
		const changedPlanRows = async () => {
			const preview = (await scenario.client.previewUpdate(
				// biome-ignore lint/suspicious/noExplicitAny: the wire is the CLI's own document
				(await scenario.wireFromConfig()) as any,
			)) as Record<string, unknown>;
			return Object.values(preview)
				.filter(Array.isArray)
				.flat()
				.filter(
					(row) =>
						(row as PreviewRow).action !== undefined &&
						(row as PreviewRow).action !== "none" &&
						(row as PreviewRow).action !== "skip",
				);
		};

		try {
			await scenario.push();
			await scenario.client.update({
				plans: [
					{
						plan_id: "pro",
						config: { ignore_past_due: true, anchor_to_month_start: true },
					},
				],
				// biome-ignore lint/suspicious/noExplicitAny: a partial catalog update
			} as any);
			expect(await proConfig()).toEqual({
				anchorToMonthStart: true,
				ignorePastDue: true,
			});

			// `{}` states every flag off: preview reports the change, push applies it.
			rewrite({ config: "{}" });
			expect((await changedPlanRows()).length).toBeGreaterThan(0);
			const { output } = await scenario.push();
			expect(output).not.toContain("No changes");
			expect(await proConfig()).toEqual({
				anchorToMonthStart: false,
				ignorePastDue: false,
			});
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});

			// A partial object turns off the flag it omits.
			await scenario.client.update({
				plans: [
					{
						plan_id: "pro",
						config: { ignore_past_due: true, anchor_to_month_start: true },
					},
				],
				// biome-ignore lint/suspicious/noExplicitAny: a partial catalog update
			} as any);
			rewrite({ config: "{ anchorToMonthStart: true }" });
			expect((await changedPlanRows()).length).toBeGreaterThan(0);
			await scenario.push();
			expect(await proConfig()).toEqual({
				anchorToMonthStart: true,
				ignorePastDue: false,
			});
		} finally {
			scenario.cleanup();
		}
	},
);
