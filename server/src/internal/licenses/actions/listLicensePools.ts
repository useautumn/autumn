import {
	customerProductLicenses,
	customerProducts,
	ErrCode,
	entities,
	type FullCustomer,
	licenseAssignments,
	licensePools,
	planLicenses,
	products,
	RecaseError,
} from "@autumn/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
	getPaidQuantity,
	isLicensePoolParentStatus,
	parentCustomerProducts,
} from "../licenseUtils.js";
import { ensurePoolsForCustomerProducts } from "./ensureLicensePools.js";

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

	const poolRows = await ctx.db
		.select({
			pool: licensePools,
			planLicense: planLicenses,
			customerProductLicense: customerProductLicenses,
			licenseProduct: products,
			parentCustomerProduct: parentCustomerProducts,
			paidCustomerProduct: customerProducts,
		})
		.from(licensePools)
		.leftJoin(planLicenses, eq(licensePools.plan_license_id, planLicenses.id))
		.leftJoin(
			customerProductLicenses,
			eq(licensePools.customer_product_license_id, customerProductLicenses.id),
		)
		.innerJoin(
			products,
			eq(licensePools.license_internal_product_id, products.internal_id),
		)
		.innerJoin(
			parentCustomerProducts,
			eq(licensePools.parent_customer_product_id, parentCustomerProducts.id),
		)
		.leftJoin(
			customerProducts,
			eq(licensePools.license_customer_product_id, customerProducts.id),
		)
		.where(
			and(
				eq(licensePools.org_id, ctx.org.id),
				eq(licensePools.env, ctx.env),
				eq(licensePools.internal_customer_id, fullCustomer.internal_id),
			),
		);

	if (poolRows.length === 0) return [];

	const poolIds = poolRows.map(({ pool }) => pool.id);
	const assignments = await ctx.db
		.select({
			assignment: licenseAssignments,
			entity_id: entities.id,
		})
		.from(licenseAssignments)
		.innerJoin(
			entities,
			eq(licenseAssignments.internal_entity_id, entities.internal_id),
		)
		.where(
			and(
				eq(licenseAssignments.org_id, ctx.org.id),
				eq(licenseAssignments.env, ctx.env),
				inArray(licenseAssignments.license_pool_id, poolIds),
				isNull(licenseAssignments.ended_at),
			),
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
				const licenseDefinition = planLicense ?? customerProductLicense;
				if (!licenseDefinition) return null;

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
		)
		.filter((pool) => pool !== null);
};
