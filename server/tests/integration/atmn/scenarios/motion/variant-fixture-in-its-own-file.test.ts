/**
 * atmn scenarios/motion — a variant written as `variant({...})` in its own file, placed into the base's `variants: [...]`
 *
 * code in motion: the config's shape is the user's; pull edits the AST, never rewrites a file
 *
 * Contract: push creates the variant; backfill writes `internalId` into
 * variants/proAnnual.ts only; a second push previews nothing; pull writes nothing.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { expectPreviewNone } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	CLI_PACKAGE_DIR,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test.concurrent(
	"variant fixture in its own file → push creates it, backfill writes its internalId there, pull is idle",
	async () => {
		const seats = uniqueTestId("atmn_seats");
		const pro = uniqueTestId("atmn_pro");
		const proAnnual = `${pro}_annual`;

		const rootConfig = `import { feature } from "${CLI_PACKAGE_DIR}/src/generated/features";
import { plan } from "${CLI_PACKAGE_DIR}/src/generated/plans";
import { atmn } from "${CLI_PACKAGE_DIR}/src/generated/wire";
import { proAnnual } from "./variants/proAnnual";

export default atmn({
	features: [
		feature({ featureId: "${seats}", name: "Seats", type: "metered", consumable: false }),
	],
	plans: [
		plan({
			planId: "${pro}",
			name: "Pro",
			price: { amount: 49, interval: "month" },
			items: [{ featureId: "${seats}", included: 5 }],
			variants: [proAnnual],
		}),
	],
});
`;
		const variantFile = `import { variant } from "${CLI_PACKAGE_DIR}/src/generated/variants";

export const proAnnual = variant({
	variantPlanId: "${proAnnual}",
	name: "Pro (annual)",
	customize: { price: { amount: 490, interval: "year" } },
});
`;

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: { raw: rootConfig },
			files: { "variants/proAnnual.ts": variantFile },
		});

		try {
			const before = scenario.files();
			const pushed = await scenario.push();
			expect(pushed.output).toContain(`+ ${pro}@v1`);

			// The variant exists under its base, with its own stable id.
			const catalog = (await scenario.client.get({
				include_versions: true,
			})) as {
				plans: {
					id: string;
					variants?: {
						variantPlanId: string;
						plan?: { internalId?: string | null };
					}[];
				}[];
			};
			const base = catalog.plans.find((row) => row.id === pro);
			const edge = base?.variants?.find(
				(row) => row.variantPlanId === proAnnual,
			);
			expect(edge?.plan?.internalId).toBeTruthy();

			// Backfill wrote the id into the variant's own file, first property.
			const after = scenario.files();
			const variantText = after.get("variants/proAnnual.ts") ?? "";
			expect(variantText).toContain(
				`variant({\n\tinternalId: ${JSON.stringify(edge?.plan?.internalId)},\n\tvariantPlanId: "${proAnnual}",`,
			);
			// The root gained the plan's own id and nothing about the variant.
			const rootText = after.get("autumn.config.ts") ?? "";
			expect(rootText).toContain(`internalId: "prod_`);
			expect(rootText).not.toContain(edge?.plan?.internalId ?? "never");
			expect(rootText).toContain("variants: [proAnnual]");
			expect(before.get("autumn.config.ts")).not.toBe(rootText);

			// Stated again as it is, there is nothing to apply, and nothing to pull.
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
			const pulled = await scenario.pull();
			expect(pulled.appended).toEqual([]);
			expect(pulled.replaced).toEqual([]);
			expect(pulled.deleted).toEqual([]);
			expect([...scenario.files().entries()]).toEqual([...after.entries()]);
		} finally {
			scenario.cleanup();
		}
	},
);
