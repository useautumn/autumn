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
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("fs")}@autumn.test`,
				}),
			],
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
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("fs")}@autumn.test`,
				}),
			],
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
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("fs")}@autumn.test`,
				}),
			],
			actions: [],
		});
		const statedId = uniqueTestId("fs_feat_stated");
		const untouchedId = uniqueTestId("fs_feat_untouched");

		await autumnV2_3.catalogV2.update({
			features: [booleanFeature(statedId), booleanFeature(untouchedId)],
		});

		await autumnV2_3.catalogV2.update({
			features: [booleanFeature(statedId)],
		});

		expect(
			await featureExists({ ctx, featureId: untouchedId }),
			"unmentioned feature survives a patch",
		).toBe(true);
	},
);
