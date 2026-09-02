/**
 * catalogV2.update — under full state, a collection the payload never mentions
 * is not managed by that payload.
 *
 * Full state means "what I state is the whole truth" — but only for the kinds
 * of thing the caller actually spoke about. A client that has never heard of a
 * catalog concept sends no key for it, and that must not read as "I have zero
 * of those, delete them all". Otherwise every concept Autumn adds after a CLI
 * ships turns that CLI into a deleter of things it cannot see.
 *
 * The legacy path already works this way — `catalogConfigResources.ts:233`
 * gates its sweep on `params.rewards !== undefined`, and legacy's schema leaves
 * `rewards` / `referral_programs` optional with no default. catalogV2's
 * `features` and `plans` carry `.optional().default([])`, which erases the
 * difference between "omitted" and "empty" before anyone can ask.
 *
 * Contract:
 *   G1  stating plans while omitting features leaves features alone
 *   G2  stating features while omitting plans leaves plans alone
 *   G3  an explicit empty array still means "I manage this and it is empty",
 *       so the wipe backstop still fires — omission and [] are not the same
 *
 * Red (current): the zod default turns an absent key into [], so the absentee
 *   sweep runs over the whole collection and G1/G2 delete.
 * Green (after): the sweep is skipped for a collection nobody stated.
 */

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
		// Full state speaks for a whole org, so it needs an org of its own.
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

		// G1: full state, but the payload only ever speaks about plans. Features
		// were never mentioned, so this payload has no opinion about them.
		await autumnV2_3.catalogV2.update({
			skip_deletions: false,
			plans: [{ plan_id: planId, name: "Kept", items: [] }],
		});

		expect(
			await featureExists({ ctx, featureId }),
			"unmentioned collection survived",
		).toBe(true);

		// G2: the same, the other way round.
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

		// G3: stating `features: []` is a claim about features — "I manage them
		// and there are none" — which is the wipe the backstop exists to refuse.
		// If omission and [] were the same thing, this would pass silently.
		const wipe = autumnV2_3.catalogV2.update({
			skip_deletions: false,
			features: [],
			plans: [],
		});
		await expect(wipe).rejects.toThrow();

		expect(
			await featureExists({ ctx, featureId }),
			"stated-empty was refused, not applied",
		).toBe(true);
	},
);
