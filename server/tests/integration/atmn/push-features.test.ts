/**
 * atmn push — a config file becomes a catalog.
 *
 * This is the first test of the whole thesis: a TypeScript config with
 * camelCase fixtures, executed in process, recased to the wire, previewed, then
 * applied — with the CLI deciding nothing along the way.
 *
 * It asserts the config that went in and the catalog that came out. Nothing
 * about rendering, because the rendering is a report rather than a decision.
 *
 * Contract:
 *   P1  a config with features creates them
 *   P2  preview reports the same changes update then applies
 *   P3  --dry-run previews and writes nothing
 *   P4  re-pushing an unchanged config is a no-op
 *   P5  removing a feature from the config removes it from the catalog
 */

import { expect, test } from "bun:test";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { uniqueTestId } from "../catalog-v2/utils/uniqueTestId.js";

const liveFeatureIds = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<string[]> => {
	const features = await FeatureService.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return features
		.filter((feature) => !feature.archived)
		.map((feature) => feature.id)
		.sort();
};

test.concurrent(
	`${chalk.yellowBright("atmn push: a config file becomes a catalog")}`,
	async () => {
		const messages = uniqueTestId("atmn_messages");
		const seats = uniqueTestId("atmn_seats");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{ features: [
				feature({ featureId: "${messages}", name: "Messages", type: "metered", consumable: true }),
				feature({ featureId: "${seats}", name: "Seats", type: "metered" }),
			] }`,
		});

		try {
			// P3: a dry run reports, then stops.
			const dry = await scenario.push({ dryRun: true });
			expect(dry.output).toContain(messages);
			expect(dry.output).toContain("Dry run");
			expect(await liveFeatureIds({ ctx: scenario.ctx })).toEqual([]);

			// P1 + P2: the same document previews and applies.
			const applied = await scenario.push();
			expect(applied.output).toContain("Applied.");
			expect(await liveFeatureIds({ ctx: scenario.ctx })).toEqual(
				[messages, seats].sort(),
			);

			// P4: nothing left to do, so preview reports nothing and update is skipped.
			const again = await scenario.push();
			expect(again.output).toContain("No changes");

			// P5: omission is a removal — the payload is the whole catalog.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{ features: [
						feature({ featureId: "${messages}", name: "Messages", type: "metered", consumable: true }),
					] }`,
				}),
			);
			await scenario.push();
			expect(await liveFeatureIds({ ctx: scenario.ctx })).toEqual([messages]);
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("atmn push: the config's wire document is what reaches the server")}`,
	async () => {
		const featureId = uniqueTestId("atmn_wire");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{ features: [
				feature({ featureId: "${featureId}", name: "Wire", type: "metered" }),
			] }`,
		});

		try {
			const wire = await scenario.wireFromConfig();

			// The CLI states the payload is the whole catalog, and asks for drafts
			// wherever the server thinks one is warranted. Both are constants.
			expect(wire.skip_deletions).toBe(false);
			expect(wire.migration).toEqual({ draft: true });

			// Fields the server owns must never appear.
			for (const forbidden of ["versioning", "propagate", "new_plan_id"]) {
				expect(wire[forbidden]).toBeUndefined();
			}

			// camelCase in the config, snake_case on the wire.
			expect(wire.features).toEqual([
				{ feature_id: featureId, name: "Wire", type: "metered" },
			]);

			await scenario.push();
			expect(await liveFeatureIds({ ctx: scenario.ctx })).toEqual([featureId]);
		} finally {
			scenario.cleanup();
		}
	},
);
