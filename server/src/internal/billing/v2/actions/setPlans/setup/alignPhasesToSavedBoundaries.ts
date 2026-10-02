import {
	CusProductStatus,
	customerProductHasActiveStatus,
	type FullCusProduct,
} from "@autumn/shared";
import { phaseStartsMatch } from "@/internal/billing/v2/utils/phaseStartsMatch";

type PhaseWithStart = { starts_at?: number | "now" };

/** Where the saved schedule changes plans: a scheduled start, or a live plan's end. */
const savedBoundaries = ({
	customerProducts,
	currentEpochMs,
}: {
	customerProducts: FullCusProduct[];
	currentEpochMs: number;
}) => [
	...customerProducts
		.filter(
			(customerProduct) =>
				customerProduct.status === CusProductStatus.Scheduled,
		)
		.map((customerProduct) => customerProduct.starts_at),
	...customerProducts
		.filter(customerProductHasActiveStatus)
		.flatMap((customerProduct) =>
			customerProduct.ended_at != null &&
			customerProduct.ended_at > currentEpochMs
				? [customerProduct.ended_at]
				: [],
		),
];

/** Snapping must keep phase starts strictly increasing. */
const startsStrictlyBetween = ({
	startsAt,
	previousStartsAt,
	nextStartsAt,
}: {
	startsAt: PhaseWithStart["starts_at"];
	previousStartsAt: PhaseWithStart["starts_at"];
	nextStartsAt: PhaseWithStart["starts_at"];
}) => {
	if (typeof startsAt !== "number") return true;
	const afterPrevious =
		typeof previousStartsAt !== "number" || startsAt > previousStartsAt;
	const beforeNext =
		typeof nextStartsAt !== "number" || startsAt < nextStartsAt;
	return afterPrevious && beforeNext;
};

/** A phase within tolerance of a saved boundary starts exactly there, so an unchanged schedule stays unchanged. */
export const alignPhasesToSavedBoundaries = <Phase extends PhaseWithStart>({
	phases,
	customerProducts,
	currentEpochMs,
}: {
	phases: [Phase, ...Phase[]];
	customerProducts: FullCusProduct[];
	currentEpochMs: number;
}): [Phase, ...Phase[]] => {
	const boundaries = savedBoundaries({ customerProducts, currentEpochMs });

	const alignPhase = (phase: Phase): Phase => {
		if (typeof phase.starts_at !== "number") return phase;
		const startsAt = phase.starts_at;
		const boundary = boundaries.find((otherStartsAt) =>
			phaseStartsMatch({ startsAt, otherStartsAt }),
		);
		return boundary === undefined ? phase : { ...phase, starts_at: boundary };
	};

	const [firstPhase, ...laterPhases] = phases.reduce<Phase[]>(
		(aligned, phase, index) => {
			const candidate = alignPhase(phase);
			const keepsOrder = startsStrictlyBetween({
				startsAt: candidate.starts_at,
				previousStartsAt: aligned.at(-1)?.starts_at,
				nextStartsAt: phases[index + 1]?.starts_at,
			});
			aligned.push(keepsOrder ? candidate : phase);
			return aligned;
		},
		[],
	);
	return [firstPhase ?? phases[0], ...laterPhases];
};
