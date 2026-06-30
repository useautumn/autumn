import { entities, licenseAssignments, products } from "@autumn/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { serializeLicenseAssignment } from "../licenseResponseUtils.js";
import { getLicenseProduct } from "../licenseUtils.js";

export const listLicenseAssignments = async ({
	ctx,
	customerId,
	entityId,
	planId,
	active = true,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	planId?: string;
	active?: boolean;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	const licenseProduct = planId
		? await getLicenseProduct({
				db: ctx.db,
				idOrInternalId: planId,
				orgId: ctx.org.id,
				env: ctx.env,
			})
		: undefined;

	return await ctx.db
		.select({
			assignment: licenseAssignments,
			entity_id: entities.id,
			license_product_id: products.id,
		})
		.from(licenseAssignments)
		.innerJoin(
			entities,
			eq(licenseAssignments.internal_entity_id, entities.internal_id),
		)
		.innerJoin(
			products,
			eq(licenseAssignments.license_internal_product_id, products.internal_id),
		)
		.where(
			and(
				eq(licenseAssignments.org_id, ctx.org.id),
				eq(licenseAssignments.env, ctx.env),
				eq(licenseAssignments.internal_customer_id, fullCustomer.internal_id),
				entityId ? eq(entities.id, entityId) : undefined,
				licenseProduct
					? eq(
							licenseAssignments.license_internal_product_id,
							licenseProduct.internal_id,
						)
					: undefined,
				active ? isNull(licenseAssignments.ended_at) : undefined,
			),
		)
		.then((rows) =>
			rows.map(({ assignment, entity_id, license_product_id }) => ({
				...serializeLicenseAssignment({
					assignment,
					entityId: entity_id ?? assignment.internal_entity_id,
					licenseProductId:
						license_product_id ?? assignment.license_internal_product_id,
				}),
			})),
		);
};
