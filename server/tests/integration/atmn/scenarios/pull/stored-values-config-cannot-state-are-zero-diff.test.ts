/**
 * atmn scenarios/pull — stored values the config cannot state → pull then push is zero diff
 *
 * Reported: pull → push of an unchanged catalog listed plans as `update` with
 * an empty diff. Each case is a row value that push re-derives differently
 * from what an older write left in the DB, on a column the API never shows:
 *
 *  - a free plan's trial stored with card_required true (the read API masks
 *    it to false: no card gate without a price)
 *  - a boolean feature's entitlement stored with carry_from_previous true
 *    (nothing to carry on a boolean; push writes false)
 *  - a usage price with max_purchase 0 (a stated cap of 0, not an absent one)
 */

import { expect, test } from "bun:test";
import { entitlements } from "@autumn/shared";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	expectPreviewNone,
	expectRoundTrip,
} from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnImports,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { and, eq } from "drizzle-orm";

const config = ({
	creditsId,
	analyticsId,
	freeTrialPlanId,
	booleanPlanId,
	capPlanId,
}: {
	creditsId: string;
	analyticsId: string;
	freeTrialPlanId: string;
	booleanPlanId: string;
	capPlanId: string;
}) =>
	`${atmnImports()}
export default atmn({
	features: [
		feature({
			featureId: "${creditsId}",
			name: "Credits",
			type: "metered",
			consumable: true,
		}),
		feature({
			featureId: "${analyticsId}",
			name: "Analytics",
			type: "boolean",
			consumable: false,
		}),
	],
	plans: [
		plan({
			active: true,
			planId: "${freeTrialPlanId}",
			name: "Starter (free)",
			versionSlug: "v1",
			items: [
				{
					featureId: "${creditsId}",
					included: 50,
					reset: { interval: "month" },
				},
			],
			freeTrial: {
				durationLength: 30,
				durationType: "day",
				cardRequired: true,
			},
		}),
		plan({
			active: true,
			planId: "${booleanPlanId}",
			name: "Pro",
			versionSlug: "v1",
			price: { amount: 20, interval: "month" },
			items: [{ featureId: "${analyticsId}" }],
		}),
		plan({
			active: true,
			planId: "${capPlanId}",
			name: "Capped",
			versionSlug: "v1",
			price: { amount: 5, interval: "month" },
			items: [
				{
					featureId: "${creditsId}",
					included: 5,
					reset: { interval: "month" },
					price: {
						amount: 0.1,
						interval: "month",
						billingMethod: "usage_based",
						maxPurchase: 0,
					},
				},
			],
		}),
	],
});
`;

test.concurrent(
	"stored values the config cannot state → pull then push is zero diff",
	async () => {
		const creditsId = uniqueTestId("atmn_credits");
		const analyticsId = uniqueTestId("atmn_analytics");
		const freeTrialPlanId = uniqueTestId("atmn_free_trial");
		const booleanPlanId = uniqueTestId("atmn_bool");
		const capPlanId = uniqueTestId("atmn_cap");
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: {
				raw: config({
					creditsId,
					analyticsId,
					freeTrialPlanId,
					booleanPlanId,
					capPlanId,
				}),
			},
		});

		try {
			await scenario.push();

			// Older writes left carry_from_previous true on boolean rows; push
			// derives false, and the API never shows the column.
			await scenario.ctx.db
				.update(entitlements)
				.set({ carry_from_previous: true })
				.where(
					and(
						eq(entitlements.org_id, scenario.ctx.org.id),
						eq(entitlements.feature_id, analyticsId),
					),
				);

			// The stored true must not read as a change on the next push.
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});

			const { freshFiles } = await expectRoundTrip({ scenario });
			const plansFile = freshFiles.get("plans.ts") ?? "";
			expect(plansFile).not.toContain("cardRequired");
			expect(plansFile).toContain("maxPurchase: 0");
		} finally {
			scenario.cleanup();
		}
	},
);
