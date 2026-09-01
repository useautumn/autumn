/**
 * catalogV2.update — full state removes features the config no longer names.
 *
 * Same rule as plans, with one difference that matters: a feature something
 * still uses cannot just go. A config that drops a feature while a plan or a
 * credit system still references it contradicts itself, and the useful
 * response is to say which reference is in the way — not to quietly archive
 * the feature and leave the config believing it is gone.
 *
 * Contract:
 *   D1  an unreferenced feature missing from the config is removed
 *   D2  a referenced one errors, naming what to do about it
 *   D3  skip_feature_ids exempts a feature
 *   D4  the default is unchanged: a patch never removes a feature
 *
 * Red (current): absentee features are uncomputable — remove_features is the
 *   only way a feature leaves, so every assertion below no-ops.
 * Green (after): omission removes, and a live reference is a hard error.
 */

import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";

const booleanFeature = (featureId: string) => ({
	feature_id: featureId,
	name: featureId,
	type: FeatureType.Boolean,
});

const featureExists = async ({
	ctx,
	featureId,
}: {
	ctx: AutumnContext;
	featureId: string;
}): Promise<boolean> => {
	const features = await FeatureService.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	return features.some(
		(feature) => feature.id === featureId && !feature.archived,
	);
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 full-state features: an unreferenced absentee is removed, a skipped one is not")}`,
	async () => {
		// Full state speaks for the whole org, so it needs an org of its own.
		const { autumnV2_3, ctx } = await initScenario({
			setup: [s.platform.create({})],
			actions: [],
		});
		const keptId = uniqueTestId("fs_feat_kept");
		const droppedId = uniqueTestId("fs_feat_dropped");
		const skippedId = uniqueTestId("fs_feat_skipped");

		await autumnV2_3.catalogV2.update({
			features: [
				booleanFeature(keptId),
				booleanFeature(droppedId),
				booleanFeature(skippedId),
			],
		});

		// D1 + D3: only `kept` is stated. `dropped` is unreferenced so it goes;
		// `skipped` was named as out of scope rather than deleted.
		await autumnV2_3.catalogV2.update({
			skip_deletions: false,
			skip_feature_ids: [skippedId],
			features: [booleanFeature(keptId)],
			plans: [],
		});

		expect(await featureExists({ ctx, featureId: keptId }), "stated").toBe(
			true,
		);
		expect(
			await featureExists({ ctx, featureId: droppedId }),
			"unreferenced absentee removed",
		).toBe(false);
		expect(
			await featureExists({ ctx, featureId: skippedId }),
			"skip_feature_ids honoured",
		).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 full-state features: dropping a feature a plan still uses is an error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [s.platform.create({})],
			actions: [],
		});
		const featureId = uniqueTestId("fs_feat_used");
		const planId = uniqueTestId("fs_feat_plan");

		await autumnV2_3.catalogV2.update({
			features: [booleanFeature(featureId)],
			plans: [
				{
					plan_id: planId,
					name: "Uses It",
					items: [{ feature_id: featureId }],
				},
			],
		});

		// D2: the config drops the feature but keeps the plan that needs it. That
		// is a contradiction, and archiving it silently would leave the config
		// describing something that is not true.
		const contradiction = autumnV2_3.catalogV2.update({
			skip_deletions: false,
			features: [],
			plans: [
				{
					plan_id: planId,
					name: "Uses It",
					items: [{ feature_id: featureId }],
				},
			],
		});
		await expect(contradiction).rejects.toThrow();

		expect(
			await featureExists({ ctx, featureId }),
			"feature survived the rejected push",
		).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 full-state features: a patch never removes a feature")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [s.platform.create({})],
			actions: [],
		});
		const statedId = uniqueTestId("fs_feat_stated");
		const untouchedId = uniqueTestId("fs_feat_untouched");

		await autumnV2_3.catalogV2.update({
			features: [booleanFeature(statedId), booleanFeature(untouchedId)],
		});

		// D4: every existing caller omits skip_deletions.
		await autumnV2_3.catalogV2.update({
			features: [booleanFeature(statedId)],
		});

		expect(
			await featureExists({ ctx, featureId: untouchedId }),
			"unmentioned feature survives a patch",
		).toBe(true);
	},
);
