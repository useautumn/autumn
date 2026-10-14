/**
 * The `combine` feature setting through the API.
 *
 * Contract:
 *   - features.create accepts `combine` on metered and credit system features and
 *     returns it; `sum` is the default and is omitted from responses.
 *   - features.update changes `combine` without touching `consumable`, and back
 *     to `sum` omits it again.
 *   - AI credit systems reject `max` / `min`.
 */

import { expect, test } from "bun:test";
import {
	ApiFeatureV1Schema,
	ApiVersion,
	FeatureCombine,
	FeatureType,
} from "@autumn/shared";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const makeFeatureId = () =>
	`combine_feature_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

test.concurrent(
	`${chalk.yellowBright("feature combine: create, update, default omitted")}`,
	async () => {
		const autumn = new AutumnInt({ version: ApiVersion.V2_1 });
		const featureId = makeFeatureId();

		const created = await autumn.post("/features.create", {
			feature_id: featureId,
			name: "Refresh hours",
			type: FeatureType.Metered,
			consumable: false,
			combine: FeatureCombine.Min,
		});
		ApiFeatureV1Schema.parse(created);
		expect(created.combine).toBe(FeatureCombine.Min);
		expect(created.consumable).toBe(false);

		const updated = await autumn.post("/features.update", {
			feature_id: featureId,
			combine: FeatureCombine.Max,
		});
		expect(updated.combine).toBe(FeatureCombine.Max);
		expect(updated.consumable).toBe(false);

		const reset = await autumn.post("/features.update", {
			feature_id: featureId,
			combine: FeatureCombine.Sum,
		});
		expect(reset.combine).toBeUndefined();

		const got = await autumn.post("/features.get", { feature_id: featureId });
		expect(got.combine).toBeUndefined();

		await autumn.post("/features.delete", { feature_id: featureId });
	},
);

test.concurrent(
	`${chalk.yellowBright("feature combine: AI credit systems reject max / min")}`,
	async () => {
		const autumn = new AutumnInt({ version: ApiVersion.V2_1 });
		const featureId = makeFeatureId();

		await expect(
			autumn.post("/features.create", {
				feature_id: featureId,
				name: "AI credits",
				type: FeatureType.AiCreditSystem,
				combine: FeatureCombine.Max,
			}),
		).rejects.toThrow();
	},
);
