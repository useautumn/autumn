/**
 * catalogV2.update — pin must freeze the previous effective, not follow.
 * Adopt inherits Words; pin must not. A clone of `next` child would still
 * pass a messages-only 10→200 assert.
 */
import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectLicenseLinkCorrect,
	expectPinDidNotLeakStock,
	expectPlanMessagesAllowance,
	featureEntitlementId,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	getFullPlan,
	messagesItem,
	messagesOverride,
	seedLinkedChildParent,
	seedTwoParentVersions,
	withCatalogPlans,
	wordsItem,
} from "../utils/seedLicensePlans.js";

const bumpWithWords = ({
	autumn,
	childId,
	versioning,
}: {
	autumn: Parameters<typeof bumpChild>[0]["autumn"];
	childId: string;
	versioning?: "new_version";
}) =>
	bumpChild({
		autumn,
		childId,
		items: [messagesItem(200), wordsItem(50)],
		versioning,
	});

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: pin does not inherit new child items")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pwords_p");
		const childId = uniqueTestId("cv2_lic_pwords_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await bumpWithWords({ autumn: autumnV2_3, childId });

				const child = await expectPlanMessagesAllowance({
					ctx,
					planId: childId,
					allowance: 200,
				});
				expect(child.entitlements).toContainEqual(
					expect.objectContaining({
						feature_id: TestFeature.Words,
						allowance: 50,
					}),
				);
				const linked = await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
					omitFeatureIds: [TestFeature.Words],
				});
				expectPinDidNotLeakStock({
					childMessagesEntitlementId: featureEntitlementId({
						entitlements: child.entitlements,
						featureId: TestFeature.Messages,
					}),
					overlayMessagesEntitlementId: featureEntitlementId({
						entitlements: linked.fullLicenseProduct.entitlements,
						featureId: TestFeature.Messages,
					}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: already-customized pin skips; Words do not flow")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pcust_p");
		const childId = uniqueTestId("cv2_lic_pcust_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride(500),
				});
				const before = await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 500,
				});
				const overlayIdBefore = featureEntitlementId({
					entitlements: before.fullLicenseProduct.entitlements,
					featureId: TestFeature.Messages,
				});

				await bumpWithWords({ autumn: autumnV2_3, childId });

				const after = await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 500,
					omitFeatureIds: [TestFeature.Words],
					planLicenseId: before.planLicense.id,
				});
				expect(
					featureEntitlementId({
						entitlements: after.fullLicenseProduct.entitlements,
						featureId: TestFeature.Messages,
					}),
				).toBe(overlayIdBefore);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: customized link + child new_version stays anchored to v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pcm_p");
		const childId = uniqueTestId("cv2_lic_pcm_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride(500),
				});
				const childV1 = await getFullPlan({ ctx, planId: childId });
				const before = await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					licenseInternalProductId: childV1.internal_id,
				});
				await bumpWithWords({
					autumn: autumnV2_3,
					childId,
					versioning: "new_version",
				});

				const childV2 = await getFullPlan({ ctx, planId: childId });
				expect(childV2.version).toBe(2);
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					licenseVersion: 1,
					customized: true,
					messagesAllowance: 500,
					omitFeatureIds: [TestFeature.Words],
					licenseInternalProductId: childV1.internal_id,
					planLicenseId: before.planLicense.id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: pin does not collapse when child reverts")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_prev_p");
		const childId = uniqueTestId("cv2_lic_prev_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await bumpChild({ autumn: autumnV2_3, childId });
				await bumpChild({ autumn: autumnV2_3, childId, included: 10 });

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: child name-only does not pin")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pdet_p");
		const childId = uniqueTestId("cv2_lic_pdet_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: childId, name: "Seat Plus" }],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 10,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: no propagate pins every parent version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pboth_p");
		const childId = uniqueTestId("cv2_lic_pboth_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await bumpChild({ autumn: autumnV2_3, childId });

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
			},
		});
	},
);
