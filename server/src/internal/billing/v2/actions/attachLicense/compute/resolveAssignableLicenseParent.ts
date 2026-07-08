import {
	type DbPlanLicense,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resolveLicenseDefinitionsForParents } from "@/internal/licenses/actions/reconcile/resolveLicenseDefinitions.js";
import { isLicenseAssignableParentCustomerProduct } from "@/internal/licenses/licenseUtils.js";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo.js";

/** Exactly one parent must offer the license: zero is unoffered, more than
 * one is ambiguous without (or even with) a parent_plan_id filter. */
const selectLicenseParent = ({
	assignableParents,
	definitionsByParentId,
	licenseProduct,
	planId,
	parentPlanId,
}: {
	assignableParents: FullCusProduct[];
	definitionsByParentId: Map<string, DbPlanLicense[]>;
	licenseProduct: FullProduct;
	planId: string;
	parentPlanId?: string;
}): { parent: FullCusProduct; licenseDefinition: DbPlanLicense } => {
	const candidates = assignableParents
		.map((parent) => ({
			parent,
			licenseDefinition: (definitionsByParentId.get(parent.id) ?? []).find(
				(definition) =>
					definition.license_internal_product_id === licenseProduct.internal_id,
			),
		}))
		.filter(
			(
				candidate,
			): candidate is {
				parent: FullCusProduct;
				licenseDefinition: DbPlanLicense;
			} => candidate.licenseDefinition !== undefined,
		)
		.filter(
			({ parent }) => !parentPlanId || parent.product.id === parentPlanId,
		);

	if (candidates.length === 0) {
		throw new RecaseError({
			message: `No plan on this customer offers license ${planId}.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (candidates.length > 1) {
		throw new RecaseError({
			message: parentPlanId
				? `Multiple instances of plan ${parentPlanId} offer license ${planId}.`
				: `Multiple plans offer license ${planId}. Provide parent_plan_id.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return candidates[0];
};

export const resolveAssignableLicenseParent = async ({
	ctx,
	fullCustomer,
	licenseProduct,
	planId,
	parentPlanId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	licenseProduct: FullProduct;
	planId: string;
	parentPlanId?: string;
}): Promise<{
	parent: FullCusProduct;
	licenseDefinition: DbPlanLicense;
	available: number;
}> => {
	const assignableParents = fullCustomer.customer_products.filter(
		(customerProduct) =>
			isLicenseAssignableParentCustomerProduct({ customerProduct }),
	);
	const definitionsByParentId = await resolveLicenseDefinitionsForParents({
		ctx,
		parents: assignableParents,
	});

	const { parent, licenseDefinition } = selectLicenseParent({
		assignableParents,
		definitionsByParentId,
		licenseProduct,
		planId,
		parentPlanId,
	});
	const balance = await customerLicenseRepo.getByParentAndLicense({
		db: ctx.db,
		parentCustomerProductId: parent.id,
		licenseInternalProductId: licenseProduct.internal_id,
	});
	// Project the granted delta the attach tx will apply (upsertGranted shifts
	// remaining by included - granted), so a raised catalog grant is usable
	// before any reconcile has refreshed the balance row.
	const available = balance
		? balance.remaining + (licenseDefinition.included - balance.granted)
		: licenseDefinition.included;

	return { parent, licenseDefinition, available };
};
