import {
	CusProductStatus,
	cp,
	type FullCusProduct,
	type FullCustomer,
	notNullish,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
import { applyPooledBalancePlanToFullCustomer } from "@/internal/billing/v2/utils/billingPlan/applyPooledBalancePlanToFullCustomer";
import { applyExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/applyExistingRollovers";
import { cusProductToExistingRollovers } from "@/internal/billing/v2/utils/handleExistingRollovers/cusProductToExistingRollovers";
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

/** Mirrors scheduled activation, which carries both usages and rollovers from the outgoing plan. */
const carryExistingStatesIntoStartingProduct = ({
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
	applyExistingRollovers({
		customerProduct,
		existingRollovers: cusProductToExistingRollovers({
			cusProduct: sourceCustomerProduct,
		}),
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
	const incomingCustomerProducts: FullCusProduct[] = [];
	const outgoingCustomerProducts: FullCusProduct[] = [];

	for (const customerProduct of phaseCustomer.customer_products) {
		if (startingIds.has(customerProduct.id)) {
			if (!cp(customerProduct).hasActiveStatus().valid) {
				incomingCustomerProducts.push(customerProduct);
			}
			carryExistingStatesIntoStartingProduct({
				ctx,
				previousCustomer: fullCustomer,
				customerProduct,
			});
			customerProduct.status = statusAtPhaseStart({ customerProduct, phase });
			continue;
		}

		if (isEndedByPhase({ customerProduct, phase })) {
			customerProduct.status = CusProductStatus.Expired;
			outgoingCustomerProducts.push(customerProduct);
		}
	}

	// Mirrors activation, which re-sizes pools from the plans leaving and joining at this phase.
	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer: phaseCustomer,
		outgoingCustomerProducts,
		incomingCustomerProducts,
		now: phase.startsAt,
	});
	applyPooledBalancePlanToFullCustomer({
		fullCustomer: phaseCustomer,
		pooledBalancePlan,
	});

	return phaseCustomer;
};
