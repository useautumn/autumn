import { CusProductStatus, type FullCustomer } from "@autumn/shared";
import { phaseStartsMatch } from "@/internal/billing/v2/utils/phaseStartsMatch";

type PhaseWithStart = { starts_at?: number | "now" };

/** A future phase within tolerance of an already-scheduled plan starts exactly when that plan does, so an unchanged schedule stays unchanged. */
export const alignPhasesToScheduledStarts = <Phase extends PhaseWithStart>({
	phases,
	fullCustomer,
}: {
	phases: [Phase, ...Phase[]];
	fullCustomer: FullCustomer;
}): [Phase, ...Phase[]] => {
	const scheduledStarts = fullCustomer.customer_products
		.filter(
			(customerProduct) =>
				customerProduct.status === CusProductStatus.Scheduled,
		)
		.map((customerProduct) => customerProduct.starts_at);

	const alignPhase = (phase: Phase): Phase => {
		if (typeof phase.starts_at !== "number") return phase;
		const startsAt = phase.starts_at;
		const scheduledStart = scheduledStarts.find((otherStartsAt) =>
			phaseStartsMatch({ startsAt, otherStartsAt }),
		);
		return scheduledStart === undefined
			? phase
			: { ...phase, starts_at: scheduledStart };
	};

	const [firstPhase, ...laterPhases] = phases;
	return [alignPhase(firstPhase), ...laterPhases.map(alignPhase)];
};
