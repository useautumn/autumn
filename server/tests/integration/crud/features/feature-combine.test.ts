/**
 * The `combine` feature setting through the API.
 *
 * Contract:
 *   - features.create accepts `combine` on metered and credit system features and
 *     returns it; `sum` is the default and is omitted from responses.
 *   - features.update changes `combine` without touching `consumable`, and back
 *     to `sum` omits it again.
 *   - AI credit systems reject `max` / `min`.
 *   - Moving a feature customers hold off `max` / `min` is rejected.
 */

import { expect, test } from "bun:test";
import {
	ApiFeatureV1Schema,
	ApiVersion,
	FeatureCombine,
	FeatureType,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

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

test.concurrent(
	`${chalk.yellowBright("feature combine: a held feature cannot leave min")}`,
	async () => {
		const autumn = new AutumnInt({ version: ApiVersion.V2_1 });
		const featureId = makeFeatureId();
		const customerId = `${featureId}_customer`;
		await autumn.post("/features.create", {
			feature_id: featureId,
			name: "Invoice fee",
			type: FeatureType.Metered,
			consumable: false,
			combine: FeatureCombine.Min,
		});
		const plan = products.base({
			id: `${featureId}_plan`,
			items: [
				constructFeatureItem({ featureId, includedUsage: 390, interval: null }),
			],
		});
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await expectAutumnError({
			errCode: "invalid_feature",
			func: () =>
				autumn.post("/features.update", {
					feature_id: featureId,
					combine: FeatureCombine.Sum,
				}),
		});
		const got = await autumn.post("/features.get", { feature_id: featureId });
		expect(got.combine).toBe(FeatureCombine.Min);
	},
);
