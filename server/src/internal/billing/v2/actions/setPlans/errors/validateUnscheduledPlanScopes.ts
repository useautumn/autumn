import type {
	FullProduct,
	MultiAttachProductContext,
	ScheduledPhaseContext,
} from "@autumn/shared";
import {
	isOneOffProduct,
	productToReplacementKey,
	RecaseError,
} from "@autumn/shared";

/** Identifies the group a plan replaces within one entity scope. */
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
 * An unscheduled plan never expires, so a phase claiming its group and scope
 * would replace it — a contradiction rather than a precedence question.
 */
export const validateUnscheduledPlanScopes = ({
	unscheduledProductContexts,
	scheduledPhaseContexts,
}: {
	unscheduledProductContexts: MultiAttachProductContext[];
	scheduledPhaseContexts: ScheduledPhaseContext[];
}) => {
	if (unscheduledProductContexts.length === 0) return;

	const scheduledGroupAndScopeKeys = new Set(
		scheduledPhaseContexts.flatMap(({ productContexts }) =>
			productContexts.flatMap(({ fullProduct, entity }) =>
				fullProduct.is_add_on || isOneOffProduct({ product: fullProduct })
					? []
					: [
							groupAndScopeKey({
								fullProduct,
								internalEntityId: entity?.internal_id,
							}),
						],
			),
		),
	);

	for (const { fullProduct, fullCustomer } of unscheduledProductContexts) {
		if (fullProduct.is_add_on || isOneOffProduct({ product: fullProduct })) {
			continue;
		}

		const isClaimedByPhase = scheduledGroupAndScopeKeys.has(
			groupAndScopeKey({
				fullProduct,
				internalEntityId: fullCustomer.entity?.internal_id,
			}),
		);
		if (!isClaimedByPhase) continue;

		throw new RecaseError({
			message: `Plan "${fullProduct.id}" is in unscheduled_plans, but a later phase schedules its group and scope. Move it into the phases or drop it from the phase that claims it.`,
			statusCode: 400,
		});
	}
};
