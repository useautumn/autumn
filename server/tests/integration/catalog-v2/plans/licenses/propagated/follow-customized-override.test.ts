/**
 * catalogV2.update — customized adopt: keep the override, let new child
 * items through, collapse when the child catches up. Child new_version
 * re-points the catalog link at v2 on the same path.
 */
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	getFullPlan,
	messagesItem,
	seedLinkedChildParent,
	withCatalogPlans,
	wordsItem,
} from "../utils/seedLicensePlans.js";

const seedOverride = ({
	autumn,
	parentId,
	childId,
}: {
	autumn: Parameters<typeof seedLinkedChildParent>[0]["autumn"];
	parentId: string;
	childId: string;
}) =>
	seedLinkedChildParent({
		autumn,
		parentId,
		childId,
		customize: {
			remove_items: [{ feature_id: TestFeature.Messages }],
			add_items: [messagesItem(500)],
		},
	});

const adoptChild = ({
	autumn,
	parentId,
	childId,
	items,
	versioning,
}: {
	autumn: Parameters<typeof bumpChild>[0]["autumn"];
	parentId: string;
	childId: string;
	items: ReturnType<typeof messagesItem>[];
	versioning?: "new_version";
}) =>
	bumpChild({
		autumn,
		childId,
		items,
		versioning,
		propagate: { license_parents: [{ plan_id: parentId }] },
		parentPlans: [{ plan_id: parentId, name: "Parent" }],
	});

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: adopt keeps override and inherits new child items")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_adopt_ov_p");
		const childId = uniqueTestId("cv2_lic_adopt_ov_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedOverride({ autumn: autumnV2_3, parentId, childId });
				await adoptChild({
					autumn: autumnV2_3,
					parentId,
					childId,
					items: [messagesItem(200), wordsItem(50)],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					included: 2,
					customized: true,
					entitlements: [
						{ feature_id: TestFeature.Messages, allowance: 500 },
						{ feature_id: TestFeature.Words, allowance: 50 },
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: adopt overlay collapses when child matches override")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_adopt_col_p");
		const childId = uniqueTestId("cv2_lic_adopt_col_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedOverride({ autumn: autumnV2_3, parentId, childId });
				await adoptChild({
					autumn: autumnV2_3,
					parentId,
					childId,
					items: [messagesItem(200), wordsItem(50)],
				});
				await adoptChild({
					autumn: autumnV2_3,
					parentId,
					childId,
					items: [messagesItem(500), wordsItem(50)],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: false,
					overlayEntitlementCount: 0,
					entitlements: [
						{ feature_id: TestFeature.Messages, allowance: 500 },
						{ feature_id: TestFeature.Words, allowance: 50 },
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: adopt new_version re-points uncustomized parent to v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_adopt_rp_p");
		const childId = uniqueTestId("cv2_lic_adopt_rp_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				const childV1 = await getFullPlan({ ctx, planId: childId });

				await adoptChild({
					autumn: autumnV2_3,
					parentId,
					childId,
					items: [messagesItem(200), wordsItem(50)],
					versioning: "new_version",
				});

				const childV2 = await getFullPlan({ ctx, planId: childId });
				expect(childV2.version).toBe(2);
				expect(childV2.internal_id).not.toBe(childV1.internal_id);
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					included: 2,
					customized: false,
					licenseInternalProductId: childV2.internal_id,
					entitlements: [
						{ feature_id: TestFeature.Messages, allowance: 200 },
						{ feature_id: TestFeature.Words, allowance: 50 },
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: adopt new_version re-points customized overlay to v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_adopt_crp_p");
		const childId = uniqueTestId("cv2_lic_adopt_crp_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedOverride({ autumn: autumnV2_3, parentId, childId });
				const childV1 = await getFullPlan({ ctx, planId: childId });

				await adoptChild({
					autumn: autumnV2_3,
					parentId,
					childId,
					items: [messagesItem(200), wordsItem(50)],
					versioning: "new_version",
				});

				const childV2 = await getFullPlan({ ctx, planId: childId });
				expect(childV2.internal_id).not.toBe(childV1.internal_id);
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					included: 2,
					customized: true,
					licenseInternalProductId: childV2.internal_id,
					entitlements: [
						{ feature_id: TestFeature.Messages, allowance: 500 },
						{ feature_id: TestFeature.Words, allowance: 50 },
					],
				});
			},
		});
	},
);
