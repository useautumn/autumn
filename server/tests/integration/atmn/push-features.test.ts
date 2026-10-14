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
				feature({ featureId: "${seats}", name: "Seats", type: "metered", consumable: false }),
			] }`,
		});

		try {
			const dry = await scenario.push({ dryRun: true });
			expect(dry.output).toContain(messages);
			expect(dry.output).toContain("Dry run");
			expect(await liveFeatureIds({ ctx: scenario.ctx })).toEqual([]);

			const applied = await scenario.push();
			expect(applied.output).toContain("Applied.");
			expect(await liveFeatureIds({ ctx: scenario.ctx })).toEqual(
				[messages, seats].sort(),
			);

			const again = await scenario.push();
			expect(again.output).toContain("No changes");

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
				feature({ featureId: "${featureId}", name: "Wire", type: "metered", consumable: true }),
			] }`,
		});

		try {
			const wire = await scenario.wireFromConfig();

			expect(wire.skip_deletions).toBe(false);
			expect(wire.migration).toEqual({ draft: true });

			for (const forbidden of ["versioning", "propagate", "new_plan_id"]) {
				expect(wire[forbidden]).toBeUndefined();
			}

			expect(wire.features).toEqual([
				{
					feature_id: featureId,
					name: "Wire",
					type: "metered",
					consumable: true,
				},
			]);

			await scenario.push();
			expect(await liveFeatureIds({ ctx: scenario.ctx })).toEqual([featureId]);
		} finally {
			scenario.cleanup();
		}
	},
);
