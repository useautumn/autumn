/**
 * catalogV2.update — declared licenses[] version anchor (`version_slug`).
 *
 * Contract:
 *   Stated slug → that child row.
 *   Omitted on an existing link → keep license_internal_product_id (no move).
 *   Omitted on a new link → child's active row (create-default, not a repoint).
 *   Unknown slug → 400.
 */
import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	type CatalogV2Client,
	getFullPlan,
	messagesItem,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

/** Child v1 (10) + active v2 (50), no parents yet. */
const seedChildWithTwoVersions = async ({
	autumn,
	childId,
}: {
	autumn: CatalogV2Client;
	childId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: childId, name: "Seat", items: [messagesItem(10)] }],
	});
	await bumpChild({
		autumn,
		childId,
		items: [messagesItem(50)],
		versioning: "new_version",
	});
};

const declareParentLink = async ({
	autumn,
	parentId,
	childId,
	versionSlug,
}: {
	autumn: CatalogV2Client;
	parentId: string;
	childId: string;
	versionSlug?: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: parentId,
				name: "Parent",
				licenses: [
					{
						license_plan_id: childId,
						included: 2,
						...(versionSlug ? { version_slug: versionSlug } : {}),
					},
				],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: declared version_slug on a new link anchors that row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_anchdec_p");
		const childId = uniqueTestId("cv2_lic_anchdec_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedChildWithTwoVersions({ autumn: autumnV2_3, childId });
				const childV1 = await getFullPlan({ ctx, planId: childId, version: 1 });

				await declareParentLink({
					autumn: autumnV2_3,
					parentId,
					childId,
					versionSlug: "v1",
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					licenseVersion: 1,
					included: 2,
					customized: false,
					messagesAllowance: 10,
					licenseInternalProductId: childV1.internal_id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: new declared omit create-defaults to the active row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_anchnew_p");
		const childId = uniqueTestId("cv2_lic_anchnew_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedChildWithTwoVersions({ autumn: autumnV2_3, childId });
				const childV2 = await getFullPlan({ ctx, planId: childId });
				expect(childV2.version).toBe(2);

				await declareParentLink({ autumn: autumnV2_3, parentId, childId });

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					included: 2,
					customized: false,
					messagesAllowance: 50,
					licenseInternalProductId: childV2.internal_id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: declared omit keeps the existing child version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_anchkeep_p");
		const childId = uniqueTestId("cv2_lic_anchkeep_c");
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
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					versioning: "new_version",
				});

				await declareParentLink({ autumn: autumnV2_3, parentId, childId });

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					licenseVersion: 1,
					included: 2,
					customized: false,
					messagesAllowance: 10,
					licenseInternalProductId: childV1.internal_id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: declared version_slug moves; later omit stays")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_anchmov_p");
		const childId = uniqueTestId("cv2_lic_anchmov_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					items: [messagesItem(50)],
					versioning: "new_version",
				});
				const childV1 = await getFullPlan({ ctx, planId: childId, version: 1 });
				const childV2 = await getFullPlan({ ctx, planId: childId });
				expect(childV2.version).toBe(2);

				await declareParentLink({
					autumn: autumnV2_3,
					parentId,
					childId,
					versionSlug: "v2",
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					licenseVersion: 2,
					messagesAllowance: 50,
					licenseInternalProductId: childV2.internal_id,
				});

				await declareParentLink({ autumn: autumnV2_3, parentId, childId });
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					licenseVersion: 2,
					messagesAllowance: 50,
					licenseInternalProductId: childV2.internal_id,
				});

				await declareParentLink({
					autumn: autumnV2_3,
					parentId,
					childId,
					versionSlug: "v1",
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					licenseVersion: 1,
					messagesAllowance: 10,
					licenseInternalProductId: childV1.internal_id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: archived child version slug is rejected")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_ancharch_p");
		const childId = uniqueTestId("cv2_lic_ancharch_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedChildWithTwoVersions({ autumn: autumnV2_3, childId });
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: childId, version: 1, archived: true }],
				});

				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: "archived version",
					func: () =>
						declareParentLink({
							autumn: autumnV2_3,
							parentId,
							childId,
							versionSlug: "v1",
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: unknown anchor slug is rejected")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_anchmiss_p");
		const childId = uniqueTestId("cv2_lic_anchmiss_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedChildWithTwoVersions({ autumn: autumnV2_3, childId });

				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: "no version with slug",
					func: () =>
						declareParentLink({
							autumn: autumnV2_3,
							parentId,
							childId,
							versionSlug: "v9",
						}),
				});
			},
		});
	},
);
