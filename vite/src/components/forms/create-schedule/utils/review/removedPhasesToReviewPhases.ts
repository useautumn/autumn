import type { ProductV2 } from "@autumn/shared";
import type { CustomerStatePhase } from "@/components/forms/customer-state/customerStateSchema";
import { formatPhaseDate } from "../schedulePhaseTiming";
import type { ReviewChangePhase } from "./types/reviewChange";

const isRemovedFuturePhase = ({
	initialPhase,
	phases,
	nowMs,
}: {
	initialPhase: CustomerStatePhase;
	phases: CustomerStatePhase[];
	nowMs: number;
}) => {
	const persistedStartsAt = initialPhase.persistedStartsAt;
	if (persistedStartsAt == null || persistedStartsAt <= nowMs) return false;
	return !phases.some((phase) => phase.persistedStartsAt === persistedStartsAt);
};

/** Saved future phases the edited schedule no longer contains; the preview only lists the phases that remain. */
export const removedPhasesToReviewPhases = ({
	initialPhases,
	phases,
	products,
	nowMs,
}: {
	initialPhases: CustomerStatePhase[];
	phases: CustomerStatePhase[];
	products: ProductV2[];
	nowMs: number;
}): ReviewChangePhase[] =>
	initialPhases
		.filter((initialPhase) =>
			isRemovedFuturePhase({ initialPhase, phases, nowMs }),
		)
		.map((initialPhase) => {
			const startsAt = initialPhase.persistedStartsAt as number;
			return {
				key: `removed-${startsAt}`,
				label: formatPhaseDate({ startsAt }),
				removed: true,
				rows: initialPhase.plans
					.filter((plan) => plan.productId)
					.map((plan, planIndex) => ({
						key: `removed-${startsAt}-${planIndex}-${plan.productId}`,
						title:
							products.find((product) => product.id === plan.productId)?.name ??
							plan.productId,
						description: "Won't start",
						entityId: plan.entityId ?? null,
						status: "removed" as const,
					})),
			};
		});
