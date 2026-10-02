import type {
	FullProduct,
	MultiAttachProductContext,
	ScheduledPhaseContext,
} from "@autumn/shared";
import { isOneOffProduct, productToReplacementKey } from "@autumn/shared";
import { setPlansError } from "./setPlansError";

/** Identifies the group a plan replaces within one entity scope; an add-on is its own group. */
const groupAndScopeKey = ({
	fullProduct,
	internalEntityId,
}: {
	fullProduct: FullProduct;
	internalEntityId?: string;
}) =>
	JSON.stringify([
		productToReplacementKey({ product: fullProduct }),
		internalEntityId ?? null,
	]);

/**
 * An unscheduled plan runs for the whole schedule, so a phase listing a plan in
 * its group and scope — or the same add-on — would overlap or replace it.
 */
export const validateUnscheduledPlanScopes = ({
	unscheduledProductContexts,
	openingPhaseProductContexts,
	scheduledPhaseContexts,
}: {
	unscheduledProductContexts: MultiAttachProductContext[];
	openingPhaseProductContexts: MultiAttachProductContext[];
	scheduledPhaseContexts: ScheduledPhaseContext[];
}) => {
	if (unscheduledProductContexts.length === 0) return;

	const phaseGroupAndScopeKeys = new Set([
		...openingPhaseProductContexts
			.filter(({ fullProduct }) => fullProduct.is_add_on)
			.map(({ fullProduct, fullCustomer }) =>
				groupAndScopeKey({
					fullProduct,
					internalEntityId: fullCustomer.entity?.internal_id,
				}),
			),
		...scheduledPhaseContexts.flatMap(({ productContexts }) =>
			productContexts.flatMap(({ fullProduct, entity }) =>
				isOneOffProduct({ product: fullProduct })
					? []
					: [
							groupAndScopeKey({
								fullProduct,
								internalEntityId: entity?.internal_id,
							}),
						],
			),
		),
	]);

	for (const { fullProduct, fullCustomer } of unscheduledProductContexts) {
		if (isOneOffProduct({ product: fullProduct })) continue;

		const isClaimedByPhase = phaseGroupAndScopeKeys.has(
			groupAndScopeKey({
				fullProduct,
				internalEntityId: fullCustomer.entity?.internal_id,
			}),
		);
		if (!isClaimedByPhase) continue;

		throw setPlansError({
			details: { type: "ongoing_plan_clash", plan_name: fullProduct.name },
		});
	}
};
