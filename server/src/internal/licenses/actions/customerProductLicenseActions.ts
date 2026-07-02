import {
	type AutumnBillingPlan,
	type CustomizePlanLicense,
	customerProductLicenses,
	customerProducts,
	type DbCustomerProductLicense,
	type DbPlanLicense,
	ErrCode,
	entities,
	licenseAssignments,
	licensePools,
	products,
	RecaseError,
} from "@autumn/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { generateId } from "@/utils/genUtils.js";
import { getLicenseProduct } from "../licenseUtils.js";

type CustomLicenseChange = NonNullable<
	AutumnBillingPlan["customLicenses"]
>[number];

export type LicenseDefinition = Pick<
	DbPlanLicense | DbCustomerProductLicense,
	"license_internal_product_id" | "included_quantity" | "customize" | "metadata"
>;

const resolveDesiredLicenses = async ({
	ctx,
	licenses,
}: {
	ctx: AutumnContext;
	licenses: CustomizePlanLicense[];
}) => {
	const seen = new Set<string>();
	for (const license of licenses) {
		if (seen.has(license.license_plan_id)) {
			throw new RecaseError({
				message: `Duplicate license ${license.license_plan_id}.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		if (license.allow_extra_quantity) {
			throw new RecaseError({
				message: "Paid license overages are not supported yet.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		seen.add(license.license_plan_id);
	}

	return await Promise.all(
		licenses.map(async (license) => ({
			params: license,
			product: await getLicenseProduct({
				db: ctx.db,
				idOrInternalId: license.license_plan_id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		})),
	);
};

const getActiveAssignmentsForParent = async ({
	ctx,
	parentCustomerProductId,
}: {
	ctx: AutumnContext;
	parentCustomerProductId: string;
}) =>
	await ctx.db
		.select({
			assignmentId: licenseAssignments.id,
			entityId: entities.id,
			licenseInternalProductId: licenseAssignments.license_internal_product_id,
			licenseProductId: products.id,
		})
		.from(licenseAssignments)
		.innerJoin(
			licensePools,
			eq(licenseAssignments.license_pool_id, licensePools.id),
		)
		.innerJoin(
			products,
			eq(licenseAssignments.license_internal_product_id, products.internal_id),
		)
		.innerJoin(
			entities,
			eq(licenseAssignments.internal_entity_id, entities.internal_id),
		)
		.where(
			and(
				eq(licenseAssignments.org_id, ctx.org.id),
				eq(licenseAssignments.env, ctx.env),
				eq(licensePools.parent_customer_product_id, parentCustomerProductId),
				isNull(licenseAssignments.ended_at),
			),
		);

export const validateCustomLicenseChanges = async ({
	ctx,
	customLicenses,
}: {
	ctx: AutumnContext;
	customLicenses?: AutumnBillingPlan["customLicenses"];
}) => {
	if (!customLicenses?.length) return;

	for (const change of customLicenses) {
		const desired = await resolveDesiredLicenses({
			ctx,
			licenses: change.licenses,
		});
		const desiredByInternalProductId = new Map(
			desired.map(({ params, product }) => [product.internal_id, params]),
		);
		const assignments = await getActiveAssignmentsForParent({
			ctx,
			parentCustomerProductId:
				change.previousParentCustomerProductId ??
				change.parentCustomerProductId,
		});

		const conflicts = new Map<
			string,
			{
				license_plan_id: string;
				requested_quantity: number;
				assignment_ids: string[];
				entity_ids: string[];
			}
		>();
		for (const assignment of assignments) {
			const requested =
				desiredByInternalProductId.get(assignment.licenseInternalProductId)
					?.included_quantity ?? 0;
			const conflict = conflicts.get(assignment.licenseInternalProductId) ?? {
				license_plan_id: assignment.licenseProductId,
				requested_quantity: requested,
				assignment_ids: [],
				entity_ids: [],
			};
			conflict.assignment_ids.push(assignment.assignmentId);
			if (assignment.entityId) conflict.entity_ids.push(assignment.entityId);
			conflicts.set(assignment.licenseInternalProductId, conflict);
		}

		const invalid = [...conflicts.entries()]
			.map(([, conflict]) => ({
				license_plan_id: conflict.license_plan_id,
				requested_quantity: conflict.requested_quantity,
				active_assignments: conflict.assignment_ids.length,
				assignment_ids: conflict.assignment_ids,
				entity_ids: conflict.entity_ids,
			}))
			.filter(
				(conflict) => conflict.active_assignments > conflict.requested_quantity,
			);

		if (invalid.length > 0) {
			throw new RecaseError({
				message:
					"Custom license changes conflict with active license assignments.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
				data: { conflicts: invalid },
			});
		}
	}
};

const syncCustomLicenseChange = async ({
	ctx,
	change,
}: {
	ctx: AutumnContext;
	change: CustomLicenseChange;
}) => {
	const parentCustomerProduct = await ctx.db.query.customerProducts.findFirst({
		where: eq(customerProducts.id, change.parentCustomerProductId),
	});
	if (!parentCustomerProduct) {
		throw new RecaseError({
			message: `Customer product ${change.parentCustomerProductId} not found.`,
			code: ErrCode.CusProductNotFound,
			statusCode: 404,
		});
	}

	const desired = await resolveDesiredLicenses({
		ctx,
		licenses: change.licenses,
	});
	const desiredInternalProductIds = desired.map(
		({ product }) => product.internal_id,
	);
	const existing = await ctx.db.query.customerProductLicenses.findMany({
		where: eq(
			customerProductLicenses.parent_customer_product_id,
			change.parentCustomerProductId,
		),
	});
	const removed = existing.filter(
		(row) =>
			!desiredInternalProductIds.includes(row.license_internal_product_id),
	);

	await ctx.db
		.update(customerProducts)
		.set({ license_set_customized: true, updated_at: Date.now() })
		.where(eq(customerProducts.id, change.parentCustomerProductId));

	if (removed.length > 0) {
		await ctx.db.delete(customerProductLicenses).where(
			inArray(
				customerProductLicenses.id,
				removed.map((row) => row.id),
			),
		);
	}

	const customLicenseRows = (
		await Promise.all(
			desired.map(async ({ params, product }) =>
				ctx.db
					.insert(customerProductLicenses)
					.values({
						id: generateId("cus_prod_lic"),
						org_id: ctx.org.id,
						env: ctx.env,
						parent_customer_product_id: change.parentCustomerProductId,
						license_internal_product_id: product.internal_id,
						included_quantity: params.included_quantity,
						allow_extra_quantity: params.allow_extra_quantity,
						customize: params.customize ?? null,
						metadata: params.metadata ?? {},
						created_at: Date.now(),
						updated_at: Date.now(),
					})
					.onConflictDoUpdate({
						target: [
							customerProductLicenses.parent_customer_product_id,
							customerProductLicenses.license_internal_product_id,
						],
						set: {
							included_quantity: params.included_quantity,
							allow_extra_quantity: params.allow_extra_quantity,
							customize: params.customize ?? null,
							metadata: params.metadata ?? {},
							updated_at: Date.now(),
						},
					})
					.returning(),
			),
		)
	).flat();

	if (customLicenseRows.length > 0) {
		await ctx.db
			.insert(licensePools)
			.values(
				customLicenseRows.map((row) => ({
					id: generateId("lic_pool"),
					org_id: ctx.org.id,
					env: ctx.env,
					internal_customer_id: parentCustomerProduct.internal_customer_id,
					parent_customer_product_id: change.parentCustomerProductId,
					plan_license_id: null,
					customer_product_license_id: row.id,
					license_internal_product_id: row.license_internal_product_id,
					license_customer_product_id: null,
					created_at: Date.now(),
					updated_at: Date.now(),
				})),
			)
			.onConflictDoNothing({
				target: [
					licensePools.parent_customer_product_id,
					licensePools.customer_product_license_id,
				],
			});
	}

	await moveAssignmentsToCustomPools({ ctx, change, customLicenseRows });

	await ctx.db
		.delete(licensePools)
		.where(
			and(
				eq(
					licensePools.parent_customer_product_id,
					change.parentCustomerProductId,
				),
				isNull(licensePools.customer_product_license_id),
			),
		);

	await deleteCachedFullCustomer({
		ctx,
		customerId:
			parentCustomerProduct.customer_id ??
			parentCustomerProduct.internal_customer_id,
		source: "license.customize",
	});
};

const moveAssignmentsToCustomPools = async ({
	ctx,
	change,
	customLicenseRows,
}: {
	ctx: AutumnContext;
	change: CustomLicenseChange;
	customLicenseRows: DbCustomerProductLicense[];
}) => {
	const sourceParentId =
		change.previousParentCustomerProductId ?? change.parentCustomerProductId;
	const sourceAssignments = await getActiveAssignmentsForParent({
		ctx,
		parentCustomerProductId: sourceParentId,
	});
	if (sourceAssignments.length === 0 || customLicenseRows.length === 0) return;

	const customPools = await ctx.db.query.licensePools.findMany({
		where: and(
			eq(
				licensePools.parent_customer_product_id,
				change.parentCustomerProductId,
			),
			inArray(
				licensePools.customer_product_license_id,
				customLicenseRows.map((row) => row.id),
			),
		),
	});
	const poolByLicenseProductId = new Map(
		customPools.map((pool) => [pool.license_internal_product_id, pool]),
	);

	for (const customLicenseRow of customLicenseRows) {
		const pool = poolByLicenseProductId.get(
			customLicenseRow.license_internal_product_id,
		);
		if (!pool) continue;

		const assignmentIds = sourceAssignments
			.filter(
				(assignment) =>
					assignment.licenseInternalProductId ===
					customLicenseRow.license_internal_product_id,
			)
			.map((assignment) => assignment.assignmentId);
		if (assignmentIds.length === 0) continue;

		await ctx.db
			.update(licenseAssignments)
			.set({ license_pool_id: pool.id })
			.where(inArray(licenseAssignments.id, assignmentIds));
	}
};

export const syncCustomLicenseChanges = async ({
	ctx,
	customLicenses,
}: {
	ctx: AutumnContext;
	customLicenses?: AutumnBillingPlan["customLicenses"];
}) => {
	if (!customLicenses?.length) return;

	await validateCustomLicenseChanges({ ctx, customLicenses });
	for (const change of customLicenses) {
		await syncCustomLicenseChange({ ctx, change });
	}
};
