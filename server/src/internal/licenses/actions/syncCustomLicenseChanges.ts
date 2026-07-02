import {
	type AutumnBillingPlan,
	type DbCustomerProductLicense,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { generateId } from "@/utils/genUtils.js";
import type { CustomLicenseChange } from "../licenseTypes.js";
import {
	customerProductLicenseRepo,
	licenseAssignmentRepo,
	licensePoolRepo,
} from "../repos/index.js";
import { getActiveAssignmentsForParent } from "./getActiveAssignmentsForParent.js";
import { resolveDesiredLicenses } from "./resolveDesiredLicenses.js";
import { validateCustomLicenseChanges } from "./validateCustomLicenseChanges.js";

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

	const customPools =
		await licensePoolRepo.listCustomPoolsByParentAndLicenseIds({
			db: ctx.db,
			parentCustomerProductId: change.parentCustomerProductId,
			customerProductLicenseIds: customLicenseRows.map((row) => row.id),
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

		await licenseAssignmentRepo.reparentByIds({
			db: ctx.db,
			assignmentIds,
			licensePoolId: pool.id,
		});
	}
};

const syncCustomLicenseChange = async ({
	ctx,
	change,
}: {
	ctx: AutumnContext;
	change: CustomLicenseChange;
}) => {
	const parentCustomerProduct =
		await customerProductLicenseRepo.getParentCustomerProductById({
			db: ctx.db,
			customerProductId: change.parentCustomerProductId,
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
	const existing =
		await customerProductLicenseRepo.listByParentCustomerProductId({
			db: ctx.db,
			parentCustomerProductId: change.parentCustomerProductId,
		});
	const removed = existing.filter(
		(row) =>
			!desiredInternalProductIds.includes(row.license_internal_product_id),
	);

	// One atomic unit: the final delete of inherited pools is destructive, and a
	// mid-sequence crash would strand assignments on pools slated for deletion.
	await ctx.db.transaction(async (tx) => {
		const txCtx = { ...ctx, db: tx as unknown as typeof ctx.db };
		await customerProductLicenseRepo.markParentLicenseSetCustomized({
			db: txCtx.db,
			parentCustomerProductId: change.parentCustomerProductId,
		});

		if (removed.length > 0) {
			await customerProductLicenseRepo.deleteByIds({
				db: txCtx.db,
				ids: removed.map((row) => row.id),
			});
		}

		const customLicenseRows = (
			await Promise.all(
				desired.map(async ({ params, product }) =>
					customerProductLicenseRepo.upsert({
						db: txCtx.db,
						orgId: ctx.org.id,
						env: ctx.env,
						id: generateId("cus_prod_lic"),
						parentCustomerProductId: change.parentCustomerProductId,
						licenseInternalProductId: product.internal_id,
						includedQuantity: params.included_quantity,
						allowExtraQuantity: params.allow_extra_quantity,
						pooledFeatureIds: params.pooled_feature_ids ?? [],
						customize: params.customize ?? null,
						metadata: params.metadata ?? {},
					}),
				),
			)
		).flat();

		if (customLicenseRows.length > 0) {
			await licensePoolRepo.insertCustomPools({
				db: txCtx.db,
				rows: customLicenseRows.map((row) => ({
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
			});
		}

		await moveAssignmentsToCustomPools({
			ctx: txCtx,
			change,
			customLicenseRows,
		});

		await licensePoolRepo.deleteInheritedByParentCustomerProductId({
			db: txCtx.db,
			parentCustomerProductId: change.parentCustomerProductId,
		});
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId:
			parentCustomerProduct.customer_id ??
			parentCustomerProduct.internal_customer_id,
		source: "license.customize",
	});
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
