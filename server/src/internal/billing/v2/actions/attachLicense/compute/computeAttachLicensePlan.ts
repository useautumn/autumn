import { type AutumnBillingPlan, findFeatureById } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initFullCustomerProductFromCustomerLicense } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromCustomerLicense.js";
import { constructEntity } from "@/internal/entities/entityUtils/entityUtils.js";
import type { AttachLicenseContext, AttachLicensePlan } from "../types.js";

export const computeAttachLicensePlan = ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: AttachLicenseContext;
}): AttachLicensePlan => {
	const { fullCustomer, customerLicense, existingEntities, newEntityParams } =
		context;

	const newEntities = newEntityParams.map((entityParam) =>
		constructEntity({
			inputEntity: {
				id: entityParam.entity_id,
				name: entityParam.name ?? null,
				feature_id: entityParam.feature_id ?? "",
			},
			feature: findFeatureById({
				features: ctx.features,
				featureId: entityParam.feature_id ?? "",
				errorOnNotFound: true,
			}),
			internalCustomerId: fullCustomer.internal_id,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
	);

	const assignments = [...existingEntities, ...newEntities].map((entity) => ({
		entity,
		customerProduct: initFullCustomerProductFromCustomerLicense({
			ctx,
			fullCustomer,
			customerLicense,
			internalEntityId: entity.internal_id,
			resetCycleAnchor: context.resetCycleAnchorMs,
			currentEpochMs: context.currentEpochMs,
		}),
	}));

	const available = customerLicense.remaining;
	// In-memory twin of the take: execute decrements the row atomically, so
	// downstream reads of the hydrated pool see post-assignment state.
	customerLicense.remaining -= assignments.length;

	const billingPlan: AutumnBillingPlan = {
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		insertEntities: newEntities,
		insertCustomerProducts: assignments.map(
			(assignment) => assignment.customerProduct,
		),
		customerLicenseUpdates: [
			{
				customerLicenseId: customerLicense.id,
				remainingChange: -assignments.length,
			},
		],
	};

	return { available, assignments, billingPlan };
};
