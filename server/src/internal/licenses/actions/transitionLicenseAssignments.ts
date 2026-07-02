import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { nullish } from "@/utils/genUtils.js";
import { isLicensePoolParentStatus } from "../licenseUtils.js";
import { licenseAssignmentRepo, licensePoolRepo } from "../repos/index.js";
import { ensurePoolsForCustomerProducts } from "./ensureLicensePools.js";
import { reconcilePooledGrantsForCustomer } from "./reconcilePooledGrants.js";

/**
 * Re-parents or ends active assignments whose parent stopped being active, then
 * reconciles pooled grants. Successors are read from DB, so run only after
 * parent mutations commit. Returns true when license state was touched.
 */
export const transitionLicenseAssignmentsForParents = async ({
	ctx,
	customerId,
	parentCustomerProductIds,
}: {
	ctx: AutumnContext;
	customerId: string;
	parentCustomerProductIds: string[];
}): Promise<boolean> => {
	if (parentCustomerProductIds.length === 0) return false;

	const parentPools = await licensePoolRepo.listByParentCustomerProductIds({
		db: ctx.db,
		parentCustomerProductIds,
	});
	if (parentPools.length === 0) return false;

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const successorCustomerProducts = fullCustomer.customer_products.filter(
		(customerProduct) =>
			!parentCustomerProductIds.includes(customerProduct.id) &&
			nullish(customerProduct.internal_entity_id) &&
			isLicensePoolParentStatus({ status: customerProduct.status }),
	);
	await ensurePoolsForCustomerProducts({
		ctx,
		customerProducts: successorCustomerProducts,
	});

	const activeAssignments =
		await licenseAssignmentRepo.listActiveWithEntityByParentCustomerProductIds({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			parentCustomerProductIds,
		});

	if (activeAssignments.length > 0) {
		const successorPools =
			successorCustomerProducts.length > 0
				? await licensePoolRepo.listByParentCustomerProductIds({
						db: ctx.db,
						parentCustomerProductIds: successorCustomerProducts.map(
							(customerProduct) => customerProduct.id,
						),
					})
				: [];
		const successorPoolByLicenseProductId = new Map(
			successorPools.map((pool) => [pool.license_internal_product_id, pool]),
		);

		const endedAt = Date.now();
		const affectedEntityIds: string[] = [];
		const reparentedAssignmentIdsByPoolId = new Map<string, string[]>();
		const endedAssignmentIds: string[] = [];
		const expiredProvisionedCustomerProductIds: string[] = [];
		for (const assignment of activeAssignments) {
			const successorPool = successorPoolByLicenseProductId.get(
				assignment.licenseInternalProductId,
			);
			if (successorPool) {
				const assignmentIds =
					reparentedAssignmentIdsByPoolId.get(successorPool.id) ?? [];
				assignmentIds.push(assignment.assignmentId);
				reparentedAssignmentIdsByPoolId.set(successorPool.id, assignmentIds);
				continue;
			}

			endedAssignmentIds.push(assignment.assignmentId);
			if (assignment.provisionedCustomerProductId) {
				expiredProvisionedCustomerProductIds.push(
					assignment.provisionedCustomerProductId,
				);
			}
			if (assignment.entityId) affectedEntityIds.push(assignment.entityId);
		}

		await ctx.db.transaction(async (tx) => {
			const txDb = tx as unknown as typeof ctx.db;
			for (const [poolId, assignmentIds] of reparentedAssignmentIdsByPoolId) {
				await licenseAssignmentRepo.reparentByIds({
					db: txDb,
					assignmentIds,
					licensePoolId: poolId,
				});
			}
			if (endedAssignmentIds.length > 0) {
				await licenseAssignmentRepo.endByIds({
					db: txDb,
					assignmentIds: endedAssignmentIds,
					endedAt,
				});
			}
			if (expiredProvisionedCustomerProductIds.length > 0) {
				await licenseAssignmentRepo.expireProvisionedCustomerProductsByIds({
					db: txDb,
					customerProductIds: expiredProvisionedCustomerProductIds,
					endedAt,
				});
			}
		});

		for (const entityId of affectedEntityIds) {
			await deleteCachedFullCustomer({
				ctx,
				customerId,
				entityId,
				source: "license.lifecycle",
			});
		}
	}

	await reconcilePooledGrantsForCustomer({ ctx, customerId });
	return true;
};
