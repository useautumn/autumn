import type {
	Entity,
	FullCusProduct,
	ProductV2,
	SyncPhase,
} from "@autumn/shared";
import { ACTIVE_STATUSES, CusProductStatus } from "@autumn/shared";
import { entityKey } from "@/components/forms/shared/utils/entityKey";
import { customerProductToCustomerStatePlan } from "./customerProductToCustomerStatePlan";
import type {
	CustomerStateForm,
	CustomerStatePhase,
	CustomerStatePlan,
} from "./customerStateSchema";

export type PhaseStart = SyncPhase["starts_at"];

/** Autumn's scheduled start is anchored, Stripe's phase start is not, so the
 * two drift by minutes on the same phase. */
const MAX_PHASE_START_DRIFT_MS = 24 * 60 * 60 * 1000;

/**
 * Customer products store their entity by internal id — resolve it to the id
 * the scope picker uses. Null is customer-level.
 */
export const resolveEntityId = ({
	entityId,
	entities,
}: {
	entityId: string | null | undefined;
	entities: Entity[];
}): string | null => {
	if (!entityId) return null;
	const entity = entities.find(
		(candidate) =>
			candidate.id === entityId || candidate.internal_id === entityId,
	);
	return entity ? entityKey(entity) : null;
};

const findCopiesOnPhase = ({
	customerProducts,
	startsAt,
}: {
	customerProducts: FullCusProduct[];
	startsAt: PhaseStart;
}): FullCusProduct[] => {
	// Past-due plans are still live, so they belong to the current phase too.
	if (startsAt === "now")
		return customerProducts.filter((customerProduct) =>
			ACTIVE_STATUSES.includes(customerProduct.status),
		);

	const scheduled = customerProducts.filter(
		(customerProduct) => customerProduct.status === CusProductStatus.Scheduled,
	);
	const nearestStart = scheduled
		.map((customerProduct) => customerProduct.starts_at)
		.filter((start) => Math.abs(start - startsAt) <= MAX_PHASE_START_DRIFT_MS)
		.sort((a, b) => Math.abs(a - startsAt) - Math.abs(b - startsAt))[0];

	return nearestStart === undefined
		? []
		: scheduled.filter(
				(customerProduct) => customerProduct.starts_at === nearestStart,
			);
};

/** A saved plan, as the customer holds it today. */
const savedPlanToCustomerStatePlan = ({
	customerProduct,
	entities,
	products,
}: {
	customerProduct: FullCusProduct;
	entities: Entity[];
	products: ProductV2[];
}): CustomerStatePlan => {
	return {
		...customerProductToCustomerStatePlan({
			cusProduct: customerProduct,
			products,
		}),
		entityId: resolveEntityId({
			entityId: customerProduct.entity_id ?? customerProduct.internal_entity_id,
			entities,
		}),
		quantity: customerProduct.quantity,
	};
};

export const toCustomerStatePhase = ({
	startsAt,
	plans,
}: {
	startsAt: PhaseStart;
	plans: CustomerStatePlan[];
}): CustomerStatePhase => ({
	startsAt: startsAt === "now" ? null : startsAt,
	plans,
});

/**
 * The customer state the saved plans imply, cut into the given phases. With
 * several phases, a live plan that never ends runs across all of them.
 */
export const customerProductsToCustomerState = ({
	customerProducts,
	phaseStarts,
	canUnschedule,
	entities,
	products,
}: {
	customerProducts: FullCusProduct[];
	phaseStarts: PhaseStart[];
	canUnschedule: boolean;
	entities: Entity[];
	products: ProductV2[];
}): Pick<CustomerStateForm, "phases" | "unscheduledPlans"> => {
	const isOpenEnded = (customerProduct: FullCusProduct) =>
		canUnschedule &&
		ACTIVE_STATUSES.includes(customerProduct.status) &&
		!customerProduct.ended_at;

	const toPlans = (phaseCustomerProducts: FullCusProduct[]) =>
		phaseCustomerProducts.map((customerProduct) =>
			savedPlanToCustomerStatePlan({ customerProduct, entities, products }),
		);

	return {
		phases: phaseStarts.map((startsAt) =>
			toCustomerStatePhase({
				startsAt,
				plans: toPlans(
					findCopiesOnPhase({ customerProducts, startsAt }).filter(
						(customerProduct) => !isOpenEnded(customerProduct),
					),
				),
			}),
		),
		unscheduledPlans: toPlans(customerProducts.filter(isOpenEnded)),
	};
};
