import { ErrCode, type FullCustomer, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getPaidQuantity, isLicensePoolParentStatus } from "../licenseUtils.js";
import { licenseAssignmentRepo, licensePoolRepo } from "../repos/index.js";
import { ensurePoolsForCustomerProducts } from "./ensureLicensePools.js";
import { reconcilePooledGrantsForCustomer } from "./reconcilePooledGrants.js";

const validateEntity = ({
	fullCustomer,
	entityId,
	customerId,
}: {
	fullCustomer: FullCustomer;
	entityId?: string;
	customerId: string;
}) => {
	if (!entityId) return;
	const entity = fullCustomer.entities?.find((item) => item.id === entityId);
	if (entity) return;
	throw new RecaseError({
		message: `Entity ${entityId} not found for customer ${customerId}.`,
		code: ErrCode.EntityNotFound,
		statusCode: 404,
	});
};

export const listLicensePools = async ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	validateEntity({ fullCustomer, entityId, customerId });

	await ensurePoolsForCustomerProducts({
		ctx,
		customerProducts: fullCustomer.customer_products,
	});
	await reconcilePooledGrantsForCustomer({
		ctx,
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
	});

	const poolRows = await licensePoolRepo.listPoolRowsWithProductByCustomer({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		internalCustomerId: fullCustomer.internal_id,
	});

	if (poolRows.length === 0) return [];

	const poolIds = poolRows.map(({ pool }) => pool.id);
	const assignments = await licenseAssignmentRepo.listActiveWithEntityByPoolIds(
		{
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			poolIds,
		},
	);
	const assignmentsByPoolId = new Map<string, typeof assignments>();
	for (const assignment of assignments) {
		const existing =
			assignmentsByPoolId.get(assignment.assignment.license_pool_id) ?? [];
		existing.push(assignment);
		assignmentsByPoolId.set(assignment.assignment.license_pool_id, existing);
	}

	return poolRows
		.filter(({ parentCustomerProduct }) =>
			isLicensePoolParentStatus({ status: parentCustomerProduct.status }),
		)
		.map(
			({
				pool,
				planLicense,
				customerProductLicense,
				licenseProduct,
				parentCustomerProduct,
				paidCustomerProduct,
			}) => {
				// The pools source check + FK cascades guarantee exactly one definition.
				const licenseDefinition = (planLicense ?? customerProductLicense)!;

				const poolAssignments = assignmentsByPoolId.get(pool.id) ?? [];
				const paidQuantity = getPaidQuantity({
					customerProduct: paidCustomerProduct,
				});
				const assigned = poolAssignments.length;

				return {
					pool_id: pool.id,
					license_product_id: licenseProduct.id,
					license_product_name: licenseProduct.name,
					parent_subscription_id:
						parentCustomerProduct.external_id ??
						parentCustomerProduct.subscription_ids?.[0] ??
						undefined,
					inventory: {
						included_quantity: licenseDefinition.included_quantity,
						paid_quantity: paidQuantity,
						assigned,
						available:
							licenseDefinition.included_quantity + paidQuantity - assigned,
					},
					assignments: poolAssignments.map(({ assignment, entity_id }) => ({
						assignment_id: assignment.id,
						entity_id,
						license_product_id: licenseProduct.id,
						started_at: assignment.started_at,
					})),
				};
			},
		);
};
