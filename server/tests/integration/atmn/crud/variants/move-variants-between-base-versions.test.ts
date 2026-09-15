/**
 * atmn crud/variants — moving a variant's `variants[]` entries from one base
 * version to another in the config re-anchors every stated variant row. The
 * preview lists the rows under the base that now owns them and names where
 * they came from; the push applies; the next push finds nothing; pull agrees.
 *
 * Red (current):  "No changes" — the preview anchored on the old pointer.
 * Green (after):  `~ Base plan: was "team"` / `~ Base version: was 1` under
 *                 team@v2, applied, idempotent, pull stable.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { productForSlug } from "@tests/utils/atmnUtils/productForSlug.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const messagesItem = (included: number) =>
	`{ featureId: "messages", included: ${included}, reset: { interval: "month" } }`;

const euVariant = ({ slug, messages }: { slug: string; messages: number }) =>
	`{ variantPlanId: "teamEu", name: "Team EU", versionSlug: "${slug}", customize: { removeItems: [{ featureId: "messages", interval: "month", intervalCount: 1 }], addItems: [${messagesItem(messages)}] } }`;

const euVariants = ({ slugs }: { slugs: string[] }) =>
	`[${slugs.map((slug, i) => euVariant({ slug, messages: 200 * (i + 1) })).join(", ")}]`;

/** team v1 + v2; `variantsOn` says which row lists the EU rows. */
const config = ({
	variantsOn,
	euSlugs,
}: {
	variantsOn: "v1" | "v2";
	euSlugs: string[];
}) => {
	const variants = `, variants: ${euVariants({ slugs: euSlugs })}`;
	return `{
	features: [
		feature({ featureId: "messages", name: "Messages", type: "metered", consumable: true }),
	],
	plans: [
		plan({ active: true, planId: "team", versionSlug: "v2", name: "Team", items: [${messagesItem(150)}]${variantsOn === "v2" ? variants : ""} }),
	
		plan({ active: false, planId: "team", versionSlug: "v1", name: "Team", items: [${messagesItem(100)}]${variantsOn === "v1" ? variants : ""} }),
	],
}`;
};

test.concurrent(
	`${chalk.yellowBright("move variants[] from team v1 to team v2: preview names the move, both EU rows re-anchor, round-trips")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					setupDefaultFeatures: true,
				}),
			],
			config: config({ variantsOn: "v1", euSlugs: ["v1"] }),
		});
		const { ctx } = scenario;
		const euRows = ["v1", "v2"] as const;

		try {
			await scenario.push();
			scenario.writeConfig(
				atmnConfigSource({
					body: config({ variantsOn: "v1", euSlugs: ["v1", "v2"] }),
				}),
			);
			await scenario.push();
			const teamV1 = await productForSlug({
				ctx,
				planId: "team",
				versionSlug: "v1",
			});
			const teamV2 = await productForSlug({
				ctx,
				planId: "team",
				versionSlug: "v2",
			});
			for (const versionSlug of euRows) {
				expect(
					(await productForSlug({ ctx, planId: "teamEu", versionSlug }))
						.base_internal_product_id,
				).toBe(teamV1.internal_id);
			}

			scenario.writeConfig(
				atmnConfigSource({
					body: config({ variantsOn: "v2", euSlugs: ["v1", "v2"] }),
				}),
			);
			const { output } = await scenario.push({ dryRun: true });
			expect(output).toContain(`team@v${teamV2.version}`);
			expect(output).toContain('~ Base plan: was "team"');
			expect(output).toContain(`~ Base version: was ${teamV1.version}`);
			expect(output).toContain('~ Base version slug: was "v1"');

			await expectRoundTrip({ scenario });
			for (const versionSlug of euRows) {
				expect(
					(await productForSlug({ ctx, planId: "teamEu", versionSlug }))
						.base_internal_product_id,
				).toBe(teamV2.internal_id);
			}
		} finally {
			scenario.cleanup();
		}
	},
);
