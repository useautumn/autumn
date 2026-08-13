/**
 * catalogV2.update — idempotent re-send of identical plan params.
 *
 * Contract:
 *   - identical re-send → action "none", no entitlement/price writes
 *   - preview of identical re-send also reports "none"
 *   - row ids (entitlements + prices) stay stable across the no-op update
 */

import { expect, test } from "bun:test";
import { BillingInterval, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	expectCatalogPreviewCorrect,
	expectCatalogResultsCorrect,
} from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../utils/expectCatalogPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 idempotent: re-send identical simple plan → none")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_idemp_min");
		const params = {
			plans: [{ plan_id: planId, name: "Idempotent Minimal" }],
		};

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update(params);

			const response = await autumnV2_3.catalogV2.update(params);
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "none" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						version: 1,
						name: "Idempotent Minimal",
						featureIds: [],
						basePrice: null,
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 idempotent: re-send shaped plan → none; row ids stable")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_idemp_shape");
		const params = {
			plans: [
				{
					plan_id: planId,
					name: "Idempotent Shaped",
					metadata: { source: "idemp" },
					config: { ignore_past_due: true },
					price: { amount: 20, interval: BillingInterval.Month },
					items: [
						{ feature_id: TestFeature.Dashboard },
						{
							feature_id: TestFeature.Messages,
							included: 100,
							reset: { interval: ResetInterval.Month },
						},
					],
				},
			],
		};

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update(params);

			const before = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: planId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			const beforeEntIds = before.entitlements.map((ent) => ent.id).sort();
			const beforePriceIds = before.prices.map((price) => price.id).sort();

			const response = await autumnV2_3.catalogV2.update(params);
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "none" }],
			});

			const after = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: planId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expect(after.entitlements.map((ent) => ent.id).sort()).toEqual(
				beforeEntIds,
			);
			expect(after.prices.map((price) => price.id).sort()).toEqual(
				beforePriceIds,
			);
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						name: "Idempotent Shaped",
						featureIds: [TestFeature.Dashboard, TestFeature.Messages],
						allowances: { [TestFeature.Messages]: 100 },
						basePrice: { amount: 20, interval: BillingInterval.Month },
						metadata: { source: "idemp" },
						config: { ignore_past_due: true },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 idempotent: preview of identical re-send reports none")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_idemp_prev");
		const params = {
			plans: [
				{
					plan_id: planId,
					name: "Idempotent Preview",
					items: [
						{
							feature_id: TestFeature.Messages,
							included: 50,
							reset: { interval: ResetInterval.Month },
						},
					],
				},
			],
		};

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update(params);

			const preview = await autumnV2_3.catalogV2.previewUpdate(params);
			expectCatalogPreviewCorrect({
				preview,
				plans: [{ planId, action: "none" }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
