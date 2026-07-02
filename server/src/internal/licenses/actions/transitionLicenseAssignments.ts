import {
	CusProductStatus,
	customerProducts,
	entities,
	licenseAssignments,
	licensePools,
} from "@autumn/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { nullish } from "@/utils/genUtils.js";
import { isLicensePoolParentStatus } from "../licenseUtils.js";
import { ensurePoolsForCustomerProducts } from "./ensureLicensePools.js";

/**
 * Re-parents or ends active assignments whose parent stopped being active.
 * Successors are read from DB, so run only after parent mutations commit.
 */
export const transitionLicenseAssignmentsForParents = async ({
	ctx,
	customerId,
	parentCustomerProductIds,
}: {
	ctx: AutumnContext;
	customerId: string;
	parentCustomerProductIds: string[];
}) => {
	if (parentCustomerProductIds.length === 0) return;

	const activeAssignments = await ctx.db
		.select({
			assignmentId: licenseAssignments.id,
			provisionedCustomerProductId:
				licenseAssignments.provisioned_customer_product_id,
			licenseInternalProductId: licenseAssignments.license_internal_product_id,
			entityId: entities.id,
		})
		.from(licenseAssignments)
		.innerJoin(
			licensePools,
			eq(licenseAssignments.license_pool_id, licensePools.id),
		)
		.innerJoin(
			entities,
			eq(licenseAssignments.internal_entity_id, entities.internal_id),
		)
		.where(
			and(
				eq(licenseAssignments.org_id, ctx.org.id),
				eq(licenseAssignments.env, ctx.env),
				inArray(
					licensePools.parent_customer_product_id,
					parentCustomerProductIds,
				),
				isNull(licenseAssignments.ended_at),
			),
		);
	if (activeAssignments.length === 0) return;

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
	const successorPools =
		successorCustomerProducts.length > 0
			? await ctx.db.query.licensePools.findMany({
					where: inArray(
						licensePools.parent_customer_product_id,
						successorCustomerProducts.map(
							(customerProduct) => customerProduct.id,
						),
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

	for (const [poolId, assignmentIds] of reparentedAssignmentIdsByPoolId) {
		await ctx.db
			.update(licenseAssignments)
			.set({ license_pool_id: poolId })
			.where(inArray(licenseAssignments.id, assignmentIds));
	}
	if (endedAssignmentIds.length > 0) {
		await ctx.db
			.update(licenseAssignments)
			.set({ ended_at: endedAt })
			.where(inArray(licenseAssignments.id, endedAssignmentIds));
	}
	if (expiredProvisionedCustomerProductIds.length > 0) {
		await ctx.db
			.update(customerProducts)
			.set({
				status: CusProductStatus.Expired,
				ended_at: endedAt,
				updated_at: endedAt,
			})
			.where(
				inArray(customerProducts.id, expiredProvisionedCustomerProductIds),
			);
	}

	for (const entityId of affectedEntityIds) {
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			entityId,
			source: "license.lifecycle",
		});
	}
};
