import {
	type DbPlanLicense,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isLicenseAssignableParentCustomerProduct } from "../../../licenseUtils.js";
import { customerLicenseRepo } from "../../../repos/customerLicenseRepo.js";
import { resolveLicenseDefinitionsForParents } from "../../reconcile/resolveLicenseDefinitions.js";

const matchesParentSubscription = ({
	parent,
	parentSubscriptionId,
}: {
	parent: FullCusProduct;
	parentSubscriptionId: string;
}) =>
	parent.id === parentSubscriptionId ||
	parent.external_id === parentSubscriptionId ||
	(parent.subscription_ids ?? []).includes(parentSubscriptionId);

export const resolveAssignableLicenseParent = async ({
	ctx,
	fullCustomer,
	licenseProduct,
	planId,
	poolId,
	parentSubscriptionId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	licenseProduct: FullProduct;
	planId: string;
	poolId?: string;
	parentSubscriptionId?: string;
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
			({ parent }) =>
				(!poolId || parent.id === poolId) &&
				(!parentSubscriptionId ||
					matchesParentSubscription({ parent, parentSubscriptionId })),
		);

	if (candidates.length === 0) {
		throw new RecaseError({
			message: `No license pool found for ${planId}.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (candidates.length > 1) {
		throw new RecaseError({
			message:
				"Multiple license pools match this license. Provide pool_id or parent_subscription_id.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const { parent, licenseDefinition } = candidates[0];
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

	if (available <= 0) {
		throw new RecaseError({
			message: `No available licenses for ${planId}.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return { parent, licenseDefinition, available };
};
