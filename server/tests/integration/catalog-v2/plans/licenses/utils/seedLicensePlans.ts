import {
	type CatalogPropagateParams,
	type CatalogPlanVersioningStrategy,
	CusProductStatus,
	customerProducts,
	type LicenseCustomize,
	ResetInterval,
	type UpdateCatalogPlanParams,
} from "@autumn/shared";
import { getFullLicenseProduct } from "@tests/integration/licenses/catalog-update/utils/getFullLicenseProduct.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { cleanupPlanCustomerRefs } from "../../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";

export type CatalogV2Client = {
	catalogV2: {
		update: (params: { plans: UpdateCatalogPlanParams[] }) => Promise<unknown>;
		previewUpdate: (params: {
			plans: UpdateCatalogPlanParams[];
		}) => Promise<unknown>;
	};
};

export const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

export const wordsItem = (included: number) => ({
	feature_id: TestFeature.Words,
	included,
	reset: { interval: ResetInterval.Month },
});

export const dashboardItem = () => ({
	feature_id: TestFeature.Dashboard,
});

export type CatalogTestItem =
	| ReturnType<typeof messagesItem>
	| ReturnType<typeof wordsItem>
	| ReturnType<typeof dashboardItem>;

export const messagesOverride = (included: number): LicenseCustomize => ({
	remove_items: [{ feature_id: TestFeature.Messages }],
	add_items: [messagesItem(included)],
});

export const getFullPlan = ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

export const withCatalogPlans = async ({
	ctx,
	planIds,
	run,
}: {
	ctx: AutumnContext;
	planIds: string[];
	run: () => Promise<void>;
}) => {
	await cleanupPlanCustomerRefs({ ctx, planIds });
	await deleteDbPlans({ ctx, planIds });
	try {
		await run();
	} finally {
		await cleanupPlanCustomerRefs({ ctx, planIds });
		await deleteDbPlans({ ctx, planIds });
	}
};

export const seedLinkedChildParent = async ({
	autumn,
	parentId,
	childId,
	included = 2,
	customize,
	childItems = [messagesItem(10)],
}: {
	autumn: CatalogV2Client;
	parentId: string;
	childId: string;
	included?: number;
	customize?: LicenseCustomize;
	childItems?: CatalogTestItem[];
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: childId,
				name: "Seat",
				items: childItems,
			},
			{
				plan_id: parentId,
				name: "Parent",
				licenses: [
					{
						license_plan_id: childId,
						included,
						...(customize ? { customize } : {}),
					},
				],
			},
		],
	});
};

/** Mint the parent and declare the same child link on the new row. */
export const seedParentVersionWithLicense = async ({
	autumn,
	parentId,
	childId,
	included = 2,
}: {
	autumn: CatalogV2Client;
	parentId: string;
	childId: string;
	included?: number;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: parentId,
				versioning: "new_version", active: true,
				licenses: [{ license_plan_id: childId, included }],
			},
		],
	});
};

/** Parent v1 + v2, both offering the same child license. */
export const seedTwoParentVersions = async ({
	autumn,
	parentId,
	childId,
}: {
	autumn: CatalogV2Client;
	parentId: string;
	childId: string;
}) => {
	await seedLinkedChildParent({ autumn, parentId, childId });
	await seedParentVersionWithLicense({ autumn, parentId, childId });
};

export const seedTwoParents = async ({
	autumn,
	childId,
	parentIds,
	included = 2,
}: {
	autumn: CatalogV2Client;
	childId: string;
	parentIds: [string, string];
	included?: number;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: childId,
				name: "Seat",
				items: [messagesItem(10)],
			},
			...parentIds.map((parentId, index) => ({
				plan_id: parentId,
				name: `Parent ${index + 1}`,
				licenses: [{ license_plan_id: childId, included }],
			})),
		],
	});
};

/** Two parents, each with v1 + v2, all four rows offering the same child. */
export const seedTwoParentsWithTwoVersions = async ({
	autumn,
	childId,
	parentIds,
	included = 2,
}: {
	autumn: CatalogV2Client;
	childId: string;
	parentIds: [string, string];
	included?: number;
}) => {
	await seedTwoParents({ autumn, childId, parentIds, included });
	for (const parentId of parentIds) {
		await seedParentVersionWithLicense({
			autumn,
			parentId,
			childId,
			included,
		});
	}
};

export const bumpChild = async ({
	autumn,
	childId,
	included = 200,
	items,
	propagate,
	versioning,
	newVersionSlug,
	parentPlans,
}: {
	autumn: CatalogV2Client;
	childId: string;
	included?: number;
	items?: CatalogTestItem[];
	propagate?: CatalogPropagateParams;
	versioning?: CatalogPlanVersioningStrategy;
	newVersionSlug?: string;
	parentPlans?: UpdateCatalogPlanParams[];
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: childId,
				items: items ?? [messagesItem(included)],
				...(versioning ? { versioning } : {}),
				...(versioning === "new_version" ? { active: true } : {}),
				...(newVersionSlug ? { new_version_slug: newVersionSlug } : {}),
				...(propagate ? { propagate } : {}),
			},
			...(parentPlans ?? []),
		],
	});
};

/** Two parents, each offering the same two license children. */
export const seedTwoParentsWithTwoChildren = async ({
	autumn,
	childIds,
	parentIds,
	included = 2,
}: {
	autumn: CatalogV2Client;
	childIds: [string, string];
	parentIds: [string, string];
	included?: number;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: childIds[0],
				name: "Seat",
				items: [messagesItem(10)],
			},
			{
				plan_id: childIds[1],
				name: "Pack",
				items: [messagesItem(10)],
			},
			...parentIds.map((parentId, index) => ({
				plan_id: parentId,
				name: `Parent ${index + 1}`,
				licenses: childIds.map((licensePlanId) => ({
					license_plan_id: licensePlanId,
					included,
				})),
			})),
		],
	});
};

/** One parent offering two license children. */
export const seedParentWithTwoChildren = async ({
	autumn,
	parentId,
	childIds,
	included = 2,
}: {
	autumn: CatalogV2Client;
	parentId: string;
	childIds: [string, string];
	included?: number;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: childIds[0],
				name: "Seat",
				items: [messagesItem(10)],
			},
			{
				plan_id: childIds[1],
				name: "Pack",
				items: [messagesItem(10)],
			},
			{
				plan_id: parentId,
				name: "Parent",
				licenses: childIds.map((licensePlanId) => ({
					license_plan_id: licensePlanId,
					included,
				})),
			},
		],
	});
};

/** Customer on the parent plan with a customer_licenses row pinned to the catalog link. */
export const seedAssignedLicenseCustomer = async ({
	ctx,
	parentId,
	childId,
	parentVersion,
}: {
	ctx: AutumnContext;
	parentId: string;
	childId: string;
	parentVersion?: number;
}) => {
	const { customerId, internalCustomerId, cusProductId } =
		await seedVersionableCustomer({
			ctx,
			planId: parentId,
			version: parentVersion,
		});
	const linked = await getFullLicenseProduct({
		ctx,
		parentPlanId: parentId,
		parentVersion,
		licensePlanId: childId,
	});
	const customerLicense = await customerLicenseRepo.upsertGranted({
		db: ctx.db,
		internalCustomerId,
		parentCustomerProductId: cusProductId,
		licenseInternalProductId: linked.planLicense.license_internal_product_id,
		planLicenseId: linked.planLicense.id,
		granted: linked.planLicense.included,
	});
	return {
		customerId,
		internalCustomerId,
		customerLicenseId: customerLicense.id,
		customerLicenseLinkId: customerLicense.link_id,
		planLicenseId: linked.planLicense.id,
	};
};

/** Seat assignment CP on the child — must not count as a child draft population. */
export const seedSeatAssignmentOnChild = async ({
	ctx,
	parentId,
	childId,
	parentVersion,
	childVersion,
}: {
	ctx: AutumnContext;
	parentId: string;
	childId: string;
	parentVersion?: number;
	childVersion?: number;
}) => {
	const assigned = await seedAssignedLicenseCustomer({
		ctx,
		parentId,
		childId,
		parentVersion,
	});
	const child = await getFullPlan({
		ctx,
		planId: childId,
		version: childVersion,
	});
	const cusProductId = generateId("cus_prod");
	await ctx.db.insert(customerProducts).values({
		id: cusProductId,
		internal_customer_id: assigned.internalCustomerId,
		product_id: childId,
		internal_product_id: child.internal_id,
		status: CusProductStatus.Active,
		created_at: Date.now(),
		starts_at: Date.now(),
		quantity: 1,
		options: [],
		is_custom: false,
		customer_license_link_id: assigned.customerLicenseLinkId,
	});
	return { ...assigned, assignmentCustomerProductId: cusProductId };
};
