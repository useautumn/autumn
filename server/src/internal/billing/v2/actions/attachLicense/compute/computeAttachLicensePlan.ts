import {
	type AutumnBillingPlan,
	type Entity,
	type FullCusProduct,
	findFeatureById,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { initFullCustomerProductFromCustomerLicense } from "@/internal/billing/v2/utils/initFullCustomerProduct/initFullCustomerProductFromCustomerLicense.js";
import { constructEntity } from "@/internal/entities/entityUtils/entityUtils.js";
import type { AttachLicenseContext, AttachLicensePlan } from "../types.js";

type LicenseAssignment = { entity: Entity; customerProduct: FullCusProduct };

/** Entities that don't exist yet, constructed for the plan's insertEntities. */
const computeNewEntities = ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: AttachLicenseContext;
}): Entity[] =>
	context.newEntityParams.map((entityParam) =>
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
			internalCustomerId: context.fullCustomer.internal_id,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
	);

/** Re-point each reused seat to its incoming entity — the seat keeps its
 * snapshots, it just changes hands. */
const computeReusedCustomerProductUpdates = ({
	reusedAssignments,
}: {
	reusedAssignments: LicenseAssignment[];
}) =>
	reusedAssignments.map(({ entity, customerProduct }) => ({
		customerProduct,
		updates: {
			internal_entity_id: entity.internal_id,
			entity_id: entity.id,
			released_at: null,
		},
	}));

export const computeAttachLicensePlan = ({
	ctx,
	context,
}: {
	ctx: AutumnContext;
	context: AttachLicenseContext;
}): AttachLicensePlan => {
	const { fullCustomer, customerLicense, unusedAssignments } = context;

	const newEntities = computeNewEntities({ ctx, context });
	const assignmentEntities = [...context.existingEntities, ...newEntities];

	// Unused seats are re-pointed before any new seat is provisioned.
	const reusedAssignments: LicenseAssignment[] = assignmentEntities
		.slice(0, unusedAssignments.length)
		.map((entity, index) => ({
			entity,
			customerProduct: unusedAssignments[index] as unknown as FullCusProduct,
		}));
	const insertedAssignments: LicenseAssignment[] = assignmentEntities
		.slice(unusedAssignments.length)
		.map((entity) => ({
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

	const billingPlan: AutumnBillingPlan = {
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		insertEntities: newEntities,
		insertCustomerProducts: insertedAssignments.map(
			(assignment) => assignment.customerProduct,
		),
		updateCustomerProducts: computeReusedCustomerProductUpdates({
			reusedAssignments,
		}),
		customerLicenseUpdates: [
			{
				customerLicenseId: customerLicense.id,
				remainingChange: -assignmentEntities.length,
			},
		],
	};

	return {
		available: customerLicense.remaining,
		assignments: [...reusedAssignments, ...insertedAssignments],
		billingPlan,
	};
};
