/**
 * catalogV2.update drafts are runnable: confirm applies upsert_licenses and
 * skips seat-assignment CPs.
 *
 * Contract:
 *   upsert_licenses-only parent op updates the attached parent's license pool
 *   combined child + parent draft applies both ops
 *   assignment CPs (customer_license_link_id set) are not child matches
 */

import { test } from "bun:test";
import type {
	ApiCustomerV5,
	AttachParamsV1Input,
	UpdateCatalogResponse,
} from "@autumn/shared";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import {
	dashboardItem,
	messagesItem,
	messagesOverride,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../../../licenses/utils/seedLicensePlans.js";
import { deleteMigrations } from "../../utils/expectMigrationDrafts.js";
import {
	childItemOp,
	dashboardAddCustomize,
	expectLicenseMigrationDraftsCorrect,
	orVersionPinnedFilter,
	parentLicenseOp,
	versionPinnedFilter,
} from "../utils/expectLicenseMigrationDrafts.js";
import {
	expectAssignmentCustomerProductUntouched,
	expectCustomerLicenseEntitlementsCorrect,
} from "./utils/expectCustomerLicenseEntitlementsCorrect.js";
import { runCatalogDraftInline } from "./utils/runCatalogDraftInline.js";
import { seedAssignmentCpOnExistingCustomer } from "./utils/seedAssignmentCpOnExistingCustomer.js";

const attachPlan = async ({
	autumn,
	customerId,
	planId,
	childId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	customerId: string;
	planId: string;
	childId?: string;
}) => {
	await autumn.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: planId,
		redirect_mode: "if_required",
		...(childId
			? { license_quantities: [{ license_plan_id: childId, quantity: 2 }] }
			: {}),
	});
};

const draftChildAddsDashboard = ({
	childId,
	parentId,
}: {
	childId: string;
	parentId: string;
}) => ({
	plan_id: childId,
	items: [messagesItem(10), dashboardItem()],
	propagate: { license_parents: [{ plan_id: parentId, version: 1 }] },
	migration: { draft: true },
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts run: upsert_licenses-only applies to the parent pool")}`,
	async () => {
		const customerId = uniqueTestId("lic_run_p");
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ paymentMethod: "success", testClock: false })],
			actions: [],
		});
		const childId = uniqueTestId("cv2_ml_run1_c");
		const parentId = uniqueTestId("cv2_ml_run1_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, parentId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride(500),
				});
				await attachPlan({
					autumn: autumnV2_3,
					customerId,
					planId: parentId,
					childId,
				});

				const response = (await autumnV2_3.catalogV2.update({
					plans: [draftChildAddsDashboard({ childId, parentId })],
				})) as UpdateCatalogResponse;
				const migrationId = response.migrations?.[0]?.id;
				if (!migrationId) throw new Error("expected a catalog draft");

				const planFilter = versionPinnedFilter({ planId: parentId });
				expectLicenseMigrationDraftsCorrect({
					migrations: await migrationRepo.get({ ctx, id: migrationId }),
					expected: [
						{
							planIds: [parentId],
							omitPlanIds: [childId],
							filter: { customer: { plan: planFilter } },
							operations: [
								parentLicenseOp({
									planFilter,
									childId,
									customize: dashboardAddCustomize,
								}),
							],
						},
					],
				});

				await expectCustomerLicenseEntitlementsCorrect({
					ctx,
					customerId,
					parentPlanId: parentId,
					omitFeatureIds: [TestFeature.Dashboard],
				});

				try {
					await runCatalogDraftInline({
						ctx,
						migrationId,
						customerIds: [customerId],
					});
					await expectCustomerLicenseEntitlementsCorrect({
						ctx,
						customerId,
						parentPlanId: parentId,
						featureIds: [TestFeature.Dashboard],
					});
				} finally {
					await deleteMigrations({ ctx, ids: [migrationId] });
				}
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts run: combined child + parent ops both apply")}`,
	async () => {
		const parentCustomerId = uniqueTestId("lic_run_2p");
		const childCustomerId = uniqueTestId("lic_run_2c");
		const { autumnV2_3, ctx } = await initScenario({
			customerId: parentCustomerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.otherCustomers([{ id: childCustomerId, paymentMethod: "success" }]),
			],
			actions: [],
		});
		const childId = uniqueTestId("cv2_ml_run2_c");
		const parentId = uniqueTestId("cv2_ml_run2_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, parentId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride(500),
				});
				await attachPlan({
					autumn: autumnV2_3,
					customerId: parentCustomerId,
					planId: parentId,
					childId,
				});
				await attachPlan({
					autumn: autumnV2_3,
					customerId: childCustomerId,
					planId: childId,
				});

				const response = (await autumnV2_3.catalogV2.update({
					plans: [draftChildAddsDashboard({ childId, parentId })],
				})) as UpdateCatalogResponse;
				const migrationId = response.migrations?.[0]?.id;
				if (!migrationId) throw new Error("expected a catalog draft");

				const childFilter = versionPinnedFilter({ planId: childId });
				const parentFilter = versionPinnedFilter({ planId: parentId });
				expectLicenseMigrationDraftsCorrect({
					migrations: await migrationRepo.get({ ctx, id: migrationId }),
					expected: [
						{
							planIds: [childId, parentId],
							filter: {
								customer: {
									plan: orVersionPinnedFilter({
										branches: [
											{ planId: childId },
											{ planId: parentId },
										],
									}),
								},
							},
							operations: [
								childItemOp({
									planFilter: childFilter,
									customize: dashboardAddCustomize,
								}),
								parentLicenseOp({
									planFilter: parentFilter,
									childId,
									customize: dashboardAddCustomize,
								}),
							],
						},
					],
				});

				try {
					await runCatalogDraftInline({
						ctx,
						migrationId,
						customerIds: [parentCustomerId, childCustomerId],
					});
					await expectCustomerLicenseEntitlementsCorrect({
						ctx,
						customerId: parentCustomerId,
						parentPlanId: parentId,
						featureIds: [TestFeature.Dashboard],
					});
					expectFlagCorrect({
						customer: await autumnV2_3.customers.get<ApiCustomerV5>(
							childCustomerId,
						),
						featureId: TestFeature.Dashboard,
						planId: childId,
					});
				} finally {
					await deleteMigrations({ ctx, ids: [migrationId] });
				}
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts run: assignment CPs are not child matches")}`,
	async () => {
		const parentCustomerId = uniqueTestId("lic_run_3p");
		const childCustomerId = uniqueTestId("lic_run_3c");
		const { autumnV2_3, ctx } = await initScenario({
			customerId: parentCustomerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.otherCustomers([{ id: childCustomerId, paymentMethod: "success" }]),
			],
			actions: [],
		});
		const childId = uniqueTestId("cv2_ml_run3_c");
		const parentId = uniqueTestId("cv2_ml_run3_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, parentId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride(500),
				});
				await attachPlan({
					autumn: autumnV2_3,
					customerId: parentCustomerId,
					planId: parentId,
					childId,
				});
				await attachPlan({
					autumn: autumnV2_3,
					customerId: childCustomerId,
					planId: childId,
				});
				const assigned = await seedAssignmentCpOnExistingCustomer({
					ctx,
					customerId: parentCustomerId,
					childId,
				});

				const response = (await autumnV2_3.catalogV2.update({
					plans: [draftChildAddsDashboard({ childId, parentId })],
				})) as UpdateCatalogResponse;
				const migrationId = response.migrations?.[0]?.id;
				if (!migrationId) throw new Error("expected a catalog draft");

				try {
					await runCatalogDraftInline({
						ctx,
						migrationId,
						customerIds: [parentCustomerId, childCustomerId],
					});
					await expectAssignmentCustomerProductUntouched({
						ctx,
						assignmentCustomerProductId: assigned.assignmentCustomerProductId,
					});
					expectFlagCorrect({
						customer: await autumnV2_3.customers.get<ApiCustomerV5>(
							childCustomerId,
						),
						featureId: TestFeature.Dashboard,
						planId: childId,
					});
				} finally {
					await deleteMigrations({ ctx, ids: [migrationId] });
				}
			},
		});
	},
);
