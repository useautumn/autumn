import {
	CusProductStatus,
	cp,
	type FullCusProduct,
	type FullCustomer,
	notNullish,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/createSchedule/compute/computeCreateSchedulePlan";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";
import { findTransitionSourceCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/findTransitionSourceCustomerProduct";

const isEndedByPhase = ({
	customerProduct,
	phase,
}: {
	customerProduct: FullCusProduct;
	phase: SchedulePhasePlan;
}) =>
	cp(customerProduct).hasActiveStatus().valid &&
	notNullish(customerProduct.ended_at) &&
	customerProduct.ended_at <= phase.startsAt;

const statusAtPhaseStart = ({
	customerProduct,
	phase,
}: {
	customerProduct: FullCusProduct;
	phase: SchedulePhasePlan;
}) =>
	notNullish(customerProduct.trial_ends_at) &&
	customerProduct.trial_ends_at > phase.startsAt
		? CusProductStatus.Trialing
		: CusProductStatus.Active;

const carryUsagesIntoStartingProduct = ({
	ctx,
	previousCustomer,
	customerProduct,
}: {
	ctx: AutumnContext;
	previousCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}) => {
	if (!cp(customerProduct).main().recurring().valid) return;

	const sourceCustomerProduct = findTransitionSourceCustomerProduct({
		fullCustomer: previousCustomer,
		customerProduct,
	});
	if (!sourceCustomerProduct) return;

	applyExistingUsages({
		ctx,
		customerProduct,
		existingUsages: cusProductToExistingUsages({
			cusProduct: sourceCustomerProduct,
			entityId: customerProduct.entity_id ?? undefined,
		}),
		entities: previousCustomer.entities,
	});
};

export const applySchedulePhaseToFullCustomer = ({
	ctx,
	fullCustomer,
	phase,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	phase: SchedulePhasePlan;
}): FullCustomer => {
	const phaseCustomer = structuredClone(fullCustomer);
	const startingIds = new Set(phase.customerProductIds);

	for (const customerProduct of phaseCustomer.customer_products) {
		if (startingIds.has(customerProduct.id)) {
			carryUsagesIntoStartingProduct({
				ctx,
				previousCustomer: fullCustomer,
				customerProduct,
			});
			customerProduct.status = statusAtPhaseStart({ customerProduct, phase });
			continue;
		}

		if (isEndedByPhase({ customerProduct, phase })) {
			customerProduct.status = CusProductStatus.Expired;
		}
	}

	return phaseCustomer;
};
