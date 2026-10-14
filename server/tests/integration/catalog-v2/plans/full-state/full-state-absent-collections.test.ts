import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "@/internal/products/ProductService.js";
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

const planExists = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}): Promise<boolean> => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		allowNotFound: true,
	});
	return Boolean(product) && !product?.archived;
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 full-state: a collection the payload omits is left alone")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("fs")}@autumn.test`,
				}),
			],
			actions: [],
		});
		const featureId = uniqueTestId("fs_absent_feat");
		const planId = uniqueTestId("fs_absent_plan");

		await autumnV2_3.catalogV2.update({
			features: [booleanFeature(featureId)],
			plans: [{ plan_id: planId, name: "Kept", items: [] }],
		});

		await autumnV2_3.catalogV2.update({
			skip_deletions: false,
			plans: [{ plan_id: planId, name: "Kept", items: [] }],
		});

		expect(
			await featureExists({ ctx, featureId }),
			"unmentioned collection survived",
		).toBe(true);

		await autumnV2_3.catalogV2.update({
			skip_deletions: false,
			features: [booleanFeature(featureId)],
		});

		expect(
			await planExists({ ctx, planId }),
			"unmentioned plans survived",
		).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 full-state: an explicit empty collection is still managed")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("fs")}@autumn.test`,
				}),
			],
			actions: [],
		});
		const featureId = uniqueTestId("fs_stated_empty");

		await autumnV2_3.catalogV2.update({
			features: [booleanFeature(featureId)],
			plans: [],
		});

		await autumnV2_3.catalogV2.update({
			skip_deletions: false,
			features: [],
			plans: [],
		});

		expect(
			await featureExists({ ctx, featureId }),
			"stated-empty removed the feature",
		).toBe(false);
	},
);
