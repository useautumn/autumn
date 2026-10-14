import { expect, test } from "bun:test";
import type { ApiPlanExpandedV1 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { withCatalogPlans } from "../licenses/utils/seedLicensePlans.js";

const getPlan = async ({
	autumn,
	planId,
}: {
	autumn: AutumnInt;
	planId: string;
}): Promise<ApiPlanExpandedV1> => {
	const catalog = await autumn.catalogV2.get({});
	const plan = catalog.plans.find((row: { id: string }) => row.id === planId);
	expect(plan, `GET catalog plan ${planId}`).toBeDefined();
	return plan!;
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors revenuecat: many ids map to one plan, each with its grant")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rc_map");
		const small = `rc_${planId}_100`;
		const large = `rc_${planId}_500`;

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "RC Mapped",
							items: [{ feature_id: TestFeature.Messages, included: 0 }],
							processors: {
								revenuecat: {
									products: [
										{
											product_id: small,
											feature_quantities: [
												{ feature_id: TestFeature.Messages, quantity: 100 },
											],
										},
										{
											product_id: large,
											feature_quantities: [
												{ feature_id: TestFeature.Messages, quantity: 500 },
											],
										},
									],
								},
							},
						},
					],
				});

				const plan = await getPlan({ autumn: autumnV2_3, planId });
				const products = plan.processors?.revenuecat?.products ?? [];
				expect(
					products.map((product) => product.product_id).sort(),
					"mapped RC ids",
				).toEqual([small, large].sort());
				expect(
					products.find((product) => product.product_id === large)
						?.feature_quantities,
					"grant for the large pack",
				).toEqual([{ feature_id: TestFeature.Messages, quantity: 500 }]);

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							processors: { revenuecat: { products: [{ product_id: small }] } },
						},
					],
				});
				expect(
					(
						await getPlan({ autumn: autumnV2_3, planId })
					).processors?.revenuecat?.products.map(
						(product) => product.product_id,
					),
					"restated set replaces",
				).toEqual([small]);

				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: planId, processors: { revenuecat: { products: [] } } },
					],
				});
				expect(
					(await getPlan({ autumn: autumnV2_3, planId })).processors
						?.revenuecat,
					"cleared mapping",
				).toBeUndefined();
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors revenuecat: an id claimed by another plan is rejected")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const ownerId = uniqueTestId("cv2_rc_owner");
		const thiefId = uniqueTestId("cv2_rc_thief");
		const sharedId = `rc_${ownerId}_shared`;

		await withCatalogPlans({
			ctx,
			planIds: [ownerId, thiefId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: ownerId,
							name: "RC Owner",
							items: [{ feature_id: TestFeature.Messages, included: 0 }],
							processors: {
								revenuecat: { products: [{ product_id: sharedId }] },
							},
						},
						{
							plan_id: thiefId,
							name: "RC Thief",
							items: [{ feature_id: TestFeature.Messages, included: 0 }],
						},
					],
				});

				const update = autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: thiefId,
							processors: {
								revenuecat: { products: [{ product_id: sharedId }] },
							},
						},
					],
				});
				await expect(update).rejects.toThrow();

				const sameRequest = autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: ownerId,
							processors: {
								revenuecat: { products: [{ product_id: sharedId }] },
							},
						},
						{
							plan_id: thiefId,
							processors: {
								revenuecat: { products: [{ product_id: sharedId }] },
							},
						},
					],
				});
				await expect(sameRequest).rejects.toThrow();
			},
		});
	},
);
