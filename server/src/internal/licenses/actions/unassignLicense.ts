import {
	CusProductStatus,
	customerProducts,
	ErrCode,
	licenseAssignments,
	RecaseError,
} from "@autumn/shared";
import { and, eq, isNull } from "drizzle-orm";
import { withLock } from "@/external/redis/redisUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getLicenseAssignmentResponse } from "../licenseResponseUtils.js";
import { getLicenseProduct } from "../licenseUtils.js";

const resolveAssignment = async ({
	ctx,
	assignmentId,
	customerId,
	entityId,
	planId,
}: {
	ctx: AutumnContext;
	assignmentId?: string;
	customerId?: string;
	entityId?: string;
	planId?: string;
}) => {
	if (assignmentId) {
		return await ctx.db.query.licenseAssignments.findFirst({
			where: and(
				eq(licenseAssignments.id, assignmentId),
				eq(licenseAssignments.org_id, ctx.org.id),
				eq(licenseAssignments.env, ctx.env),
			),
		});
	}

	if (!customerId || !entityId || !planId) {
		throw new RecaseError({
			message: "Provide assignment_id or customer_id, entity_id, and plan_id.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const [fullCustomer, licenseProduct] = await Promise.all([
		CusService.getFull({ ctx, idOrInternalId: customerId, withEntities: true }),
		getLicenseProduct({
			db: ctx.db,
			idOrInternalId: planId,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
	]);
	const entity = fullCustomer.entities?.find((item) => item.id === entityId);
	if (!entity) return undefined;

	return await ctx.db.query.licenseAssignments.findFirst({
		where: and(
			eq(licenseAssignments.org_id, ctx.org.id),
			eq(licenseAssignments.env, ctx.env),
			eq(licenseAssignments.internal_customer_id, fullCustomer.internal_id),
			eq(licenseAssignments.internal_entity_id, entity.internal_id),
			eq(
				licenseAssignments.license_internal_product_id,
				licenseProduct.internal_id,
			),
			isNull(licenseAssignments.ended_at),
		),
	});
};

export const unassignLicense = async ({
	ctx,
	assignmentId,
	customerId,
	entityId,
	planId,
}: {
	ctx: AutumnContext;
	assignmentId?: string;
	customerId?: string;
	entityId?: string;
	planId?: string;
}) => {
	const assignment = await resolveAssignment({
		ctx,
		assignmentId,
		customerId,
		entityId,
		planId,
	});
	if (!assignment) return assignment;

	const customer = await ctx.db.query.customers.findFirst({
		where: (table, { eq }) =>
			eq(table.internal_id, assignment.internal_customer_id),
	});
	const unassign = async () => {
		if (assignment.ended_at) {
			return getLicenseAssignmentResponse({ ctx, assignment });
		}

		const endedAt = Date.now();
		await ctx.db.transaction(async (tx) => {
			await tx
				.update(licenseAssignments)
				.set({ ended_at: endedAt })
				.where(eq(licenseAssignments.id, assignment.id));

			if (assignment.provisioned_customer_product_id) {
				await tx
					.update(customerProducts)
					.set({
						status: CusProductStatus.Expired,
						ended_at: endedAt,
						updated_at: endedAt,
					})
					.where(
						eq(customerProducts.id, assignment.provisioned_customer_product_id),
					);
			}
		});

		const response = await getLicenseAssignmentResponse({ ctx, assignment });
		if (customer?.id) {
			await deleteCachedFullCustomer({
				ctx,
				customerId: customer.id,
				entityId: response.entity_id,
				source: "license.unassign",
			});
		}

		return {
			...response,
			ended_at: endedAt,
		};
	};

	if (process.env.NODE_ENV === "development") return unassign();

	return withLock({
		lockKey: buildBillingLockKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: customer?.id ?? assignment.internal_customer_id,
		}),
		ttlMs: 120000,
		errorMessage:
			"License assignment already in progress for this customer, try again in a few seconds",
		fn: unassign,
	});
};
