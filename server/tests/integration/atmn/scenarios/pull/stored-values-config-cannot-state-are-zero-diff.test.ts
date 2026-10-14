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
	zeroCapPlanId,
}: {
	creditsId: string;
	analyticsId: string;
	freeTrialPlanId: string;
	booleanPlanId: string;
	capPlanId: string;
	zeroCapPlanId: string;
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
		plan({
			active: true,
			planId: "${zeroCapPlanId}",
			name: "Zero capped",
			versionSlug: "v1",
			price: { amount: 5, interval: "month" },
			items: [
				{
					featureId: "${creditsId}",
					included: 0,
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
		const zeroCapPlanId = uniqueTestId("atmn_zerocap");
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
					zeroCapPlanId,
				}),
			},
		});

		try {
			await scenario.push();

			await scenario.ctx.db
				.update(entitlements)
				.set({ carry_from_previous: true, allowance: 0 })
				.where(
					and(
						eq(entitlements.org_id, scenario.ctx.org.id),
						eq(entitlements.feature_id, analyticsId),
					),
				);
			await scenario.ctx.db
				.update(entitlements)
				.set({ carry_from_previous: true })
				.where(
					and(
						eq(entitlements.org_id, scenario.ctx.org.id),
						eq(entitlements.feature_id, creditsId),
					),
				);

			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});

			const { freshFiles } = await expectRoundTrip({ scenario });
			const plansFile = freshFiles.get("plans.ts") ?? "";
			expect(plansFile).not.toContain("cardRequired");
			expect(plansFile.match(/maxPurchase: 0/g)).toHaveLength(2);

			scenario.writeConfig(
				(scenario.files().get("autumn.config.ts") ?? "").replace(
					"included: 50,",
					"included: 75,",
				),
			);
			await scenario.push();
			const creditsRows = await scenario.ctx.db
				.select({ carry: entitlements.carry_from_previous })
				.from(entitlements)
				.where(
					and(
						eq(entitlements.org_id, scenario.ctx.org.id),
						eq(entitlements.feature_id, creditsId),
					),
				);
			expect(creditsRows.length).toBeGreaterThan(0);
			expect(creditsRows.every((row) => row.carry === true)).toBe(true);
		} finally {
			scenario.cleanup();
		}
	},
);

test.concurrent(
	"a free plan's trial card_required is not masked once the same push makes it paid",
	async () => {
		const creditsId = uniqueTestId("atmn_credits");
		const planId = uniqueTestId("atmn_free_to_paid");
		const withPrice = ({ price }: { price: boolean }) =>
			`${atmnImports()}
export default atmn({
	features: [
		feature({
			featureId: "${creditsId}",
			name: "Credits",
			type: "metered",
			consumable: true,
		}),
	],
	plans: [
		plan({
			active: true,
			planId: "${planId}",
			name: "Starter",
			versionSlug: "v1",
			${price ? 'price: { amount: 20, interval: "month" },' : ""}
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
				${price ? "" : "cardRequired: true,"}
			},
		}),
	],
});
`;
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: { raw: withPrice({ price: false }) },
		});

		try {
			await scenario.push();
			scenario.writeConfig(withPrice({ price: true }));
			await scenario.push();
			const catalog = (await scenario.client.get({})) as {
				plans: { id: string; freeTrial: { cardRequired: boolean } | null }[];
			};
			const plan = catalog.plans.find((row) => row.id === planId);
			expect(plan?.freeTrial?.cardRequired).toBe(false);
		} finally {
			scenario.cleanup();
		}
	},
);
