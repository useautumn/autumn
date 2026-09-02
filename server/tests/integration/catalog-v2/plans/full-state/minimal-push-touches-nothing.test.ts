/**
 * catalogV2.update — a payload that mentions one field changes one field.
 *
 * Every field in the upsert path is gated on `!== undefined`, so omission means
 * "unchanged". That is a convention held up by every writer choosing to follow
 * it, and the schema test can only see the schema half: someone writing
 * `bomboclart: planParams.bomboclart ?? []` inside a resolver would wipe the
 * field with a perfectly clean schema.
 *
 * This is the other half of that net. It states nothing but a name against a
 * fully-loaded plan and asserts everything else survived, so it fails for any
 * field anyone adds later that reads absence as "empty" — including fields
 * that do not exist yet, which is the entire point.
 *
 * Contract:
 *   H1  items survive a push that never mentions them
 *   H2  the base price survives
 *   H3  the free trial survives
 *   H4  the stated field does change, so the push was real
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	FreeTrialDuration,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 omission: a name-only push leaves every unmentioned field alone")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_minimal");
		await deleteDbPlans({ ctx, planIds: [planId] });

		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Loaded",
						price: { amount: 20, interval: BillingInterval.Month },
						free_trial: {
							duration_length: 14,
							duration_type: FreeTrialDuration.Day,
							card_required: true,
						},
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			// Everything except the name is absent. Under "omission is unchanged"
			// this is a rename and nothing else.
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Renamed" }],
			});

			const full = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: planId,
				orgId: ctx.org.id,
				env: ctx.env,
			});

			expect(full.name, "H4: the stated field changed").toBe("Renamed");
			expect(full.entitlements.length, "H1: items survived").toBe(1);
			expect(full.prices.length, "H2: base price survived").toBe(1);
			expect(full.free_trial?.length, "H3: free trial survived").toBe(14);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
