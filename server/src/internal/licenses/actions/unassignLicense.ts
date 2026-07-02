import { ErrCode, RecaseError } from "@autumn/shared";
import { withLock } from "@/external/redis/redisUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { getLicenseAssignmentResponse } from "../licenseResponseUtils.js";
import { getLicenseProduct } from "../licenseUtils.js";
import { licenseAssignmentRepo } from "../repos/index.js";

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
		return await licenseAssignmentRepo.getById({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			assignmentId,
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

	return await licenseAssignmentRepo.findActive({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		internalCustomerId: fullCustomer.internal_id,
		internalEntityId: entity.internal_id,
		licenseInternalProductId: licenseProduct.internal_id,
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
	if (!assignment) {
		throw new RecaseError({
			message: assignmentId
				? `License assignment ${assignmentId} not found.`
				: "License assignment not found.",
			code: ErrCode.InvalidRequest,
			statusCode: 404,
		});
	}

	const customer = await licenseAssignmentRepo.getCustomerByInternalId({
		db: ctx.db,
		internalCustomerId: assignment.internal_customer_id,
	});
	const unassign = async () => {
		if (assignment.ended_at) {
			return getLicenseAssignmentResponse({ ctx, assignment });
		}

		const endedAt = Date.now();
		await ctx.db.transaction(async (tx) => {
			const txDb = tx as unknown as typeof ctx.db;
			await licenseAssignmentRepo.endById({
				db: txDb,
				assignmentId: assignment.id,
				endedAt,
			});

			if (assignment.provisioned_customer_product_id) {
				await licenseAssignmentRepo.expireProvisionedCustomerProductById({
					db: txDb,
					customerProductId: assignment.provisioned_customer_product_id,
					endedAt,
				});
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
