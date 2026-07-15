import {
	type AttachLicenseEntityParams,
	type AttachLicenseParamsV0,
	type Entity,
	ErrCode,
	type FullCustomer,
	isLicenseAssignableParentCustomerProduct,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupStripeBillingContext } from "@/internal/billing/v2/providers/stripe/setup/setupStripeBillingContext.js";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor.js";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo.js";
import type { AttachLicenseContext } from "../types.js";

/** Exactly one assignable parent must hold a pool of the license plan: zero
 * is unoffered (or not yet planted), more than one is ambiguous. */
const resolveAssignmentTarget = ({
	fullCustomer,
	licensePlanId,
}: {
	fullCustomer: FullCustomer;
	licensePlanId: string;
}): Pick<AttachLicenseContext, "parentCustomerProduct" | "customerLicense"> => {
	const candidates = fullCustomer.customer_products
		.filter((customerProduct) =>
			isLicenseAssignableParentCustomerProduct({ customerProduct }),
		)
		.flatMap((parentCustomerProduct) =>
			(parentCustomerProduct.customer_licenses ?? []).flatMap(
				(customerLicense) => {
					const { planLicense } = customerLicense;
					if (planLicense?.product.id !== licensePlanId) return [];
					return [
						{
							parentCustomerProduct,
							customerLicense: { ...customerLicense, planLicense },
						},
					];
				},
			),
		);

	if (candidates.length === 0) {
		throw new RecaseError({
			message: `No plan on this customer offers license ${licensePlanId}.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (candidates.length > 1) {
		throw new RecaseError({
			message: `Multiple plans offer license ${licensePlanId}.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const target = candidates[0];
	if (target.customerLicense.planLicense.product.archived) {
		throw new RecaseError({
			message: `License plan ${licensePlanId} is archived and cannot be assigned.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return target;
};

/** Requested entities split against the customer's existing ones — the
 * unmatched remainder is what the plan will create. */
const splitRequestedEntities = ({
	fullCustomer,
	entityParams,
}: {
	fullCustomer: FullCustomer;
	entityParams: AttachLicenseEntityParams[];
}) => {
	const entityByEntityId = new Map(
		(fullCustomer.entities ?? []).map((entity) => [entity.id, entity]),
	);

	const existingEntities: Entity[] = [];
	const newEntityParams: AttachLicenseEntityParams[] = [];
	for (const entityParam of entityParams) {
		const existingEntity = entityByEntityId.get(entityParam.entity_id);
		if (existingEntity) existingEntities.push(existingEntity);
		else newEntityParams.push(entityParam);
	}
	return { existingEntities, newEntityParams };
};

/** One full-customer load; the assignment target and entity split derive from
 * the hydrated customer, so compute stays a pure plan assembly. */
export const setupAttachLicenseContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: AttachLicenseParamsV0;
}): Promise<AttachLicenseContext> => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: params.customer_id },
	});

	const target = resolveAssignmentTarget({
		fullCustomer,
		licensePlanId: params.plan_id,
	});

	// The assignment's cycles anchor to the parent's billing state — same
	// derivation as attach, minus any billing changes.
	const [{ stripeSubscription, testClockFrozenTime }, unusedAssignments] =
		await Promise.all([
			setupStripeBillingContext({
				ctx,
				fullCustomer,
				targetCustomerProduct: target.parentCustomerProduct,
				createStripeCustomerIfMissing: false,
			}),
			licenseAssignmentRepo.listUnusedAssignmentsByLinkId({
				db: ctx.db,
				customerLicenseLinkId: target.customerLicense.link_id,
				limit: params.entities.length,
			}),
		]);
	const currentEpochMs = testClockFrozenTime ?? Date.now();
	const billingCycleAnchorMs = setupBillingCycleAnchor({
		stripeSubscription,
		customerProduct: target.parentCustomerProduct,
		newFullProduct: target.customerLicense.planLicense.product,
		currentEpochMs,
	});
	const resetCycleAnchorMs = setupResetCycleAnchor({
		billingCycleAnchorMs,
		newFullProduct: target.customerLicense.planLicense.product,
	});

	return {
		fullCustomer,
		...target,
		currentEpochMs,
		resetCycleAnchorMs,
		entityParams: params.entities,
		unusedAssignments,
		...splitRequestedEntities({ fullCustomer, entityParams: params.entities }),
	};
};
