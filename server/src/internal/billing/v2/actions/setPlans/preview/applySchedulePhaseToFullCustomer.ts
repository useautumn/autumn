import {
	CusProductStatus,
	cp,
	EntInterval,
	type FullCusProduct,
	type FullCustomer,
	type FullCustomerEntitlement,
	getNextResetAt,
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
import { runsInProjection } from "./runsInProjection";

const isEndedByPhase = ({
	customerProduct,
	phase,
}: {
	customerProduct: FullCusProduct;
	phase: SchedulePhasePlan;
}) =>
	runsInProjection(customerProduct) &&
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

/** Resets due by the phase have run by then, so the next one is the first after it starts. */
const rollResetsForwardToPhase = ({
	fullCustomer,
	phase,
}: {
	fullCustomer: FullCustomer;
	phase: SchedulePhasePlan;
}) => {
	const customerEntitlements: FullCustomerEntitlement[] = [
		...fullCustomer.customer_products.flatMap(
			(customerProduct) => customerProduct.customer_entitlements,
		),
		...(fullCustomer.extra_customer_entitlements ?? []),
	];
	for (const customerEntitlement of customerEntitlements) {
		const { next_reset_at: nextResetAt, entitlement } = customerEntitlement;
		if (!nextResetAt || nextResetAt > phase.startsAt) continue;
		if (!entitlement.interval || entitlement.interval === EntInterval.Lifetime)
			continue;

		customerEntitlement.next_reset_at = getNextResetAt({
			curReset: nextResetAt,
			interval: entitlement.interval,
			intervalCount: entitlement.interval_count ?? 1,
			now: phase.startsAt,
		});
	}
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
	rollResetsForwardToPhase({ fullCustomer: phaseCustomer, phase });
	const startingIds = new Set(phase.customerProductIds);
	const incomingCustomerProducts: FullCusProduct[] = [];
	const outgoingCustomerProducts: FullCusProduct[] = [];

	for (const customerProduct of phaseCustomer.customer_products) {
		if (startingIds.has(customerProduct.id)) {
			if (!runsInProjection(customerProduct)) {
				incomingCustomerProducts.push(customerProduct);
				carryExistingStatesIntoStartingProduct({
					ctx,
					previousCustomer: fullCustomer,
					customerProduct,
				});
			}
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
