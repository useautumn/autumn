import type {
	SetPlansPreviewPhase,
	SetPlansReviewSection,
	SetPlansReviewText,
} from "@autumn/shared";

type TextPart = SetPlansReviewText[number];

/** Parts flattened in order, with neighbouring strings merged. */
export const reviewText = (
	...parts: (TextPart | SetPlansReviewText)[]
): SetPlansReviewText =>
	parts.flat().reduce<SetPlansReviewText>((text, part) => {
		const last = text.at(-1);
		if (typeof part === "string" && typeof last === "string") {
			text[text.length - 1] = last + part;
		} else if (part !== "") {
			text.push(part);
		}
		return text;
	}, []);

export const dateText = (ms: number): SetPlansReviewText => [{ date: ms }];

export const joinDetail = (
	parts: (SetPlansReviewText | string | undefined)[],
): SetPlansReviewText | undefined => {
	const present = parts.filter(
		(part): part is SetPlansReviewText | string =>
			part !== undefined && part !== "",
	);
	if (present.length === 0) return undefined;
	return reviewText(
		...present.flatMap((part, index) => (index === 0 ? [part] : [" · ", part])),
	);
};

export const summarizeCounts = ({
	counts,
	emptyLabel,
}: {
	counts: [label: SetPlansReviewText | string, count: number][];
	emptyLabel: string;
}): SetPlansReviewText =>
	joinDetail(
		counts
			.filter(([, count]) => count > 0)
			.map(([label, count]) => reviewText(`${count} `, label)),
	) ?? [emptyLabel];

export const phaseLabel = (phase: SetPlansPreviewPhase): SetPlansReviewText =>
	phase.starts_now ? ["Now"] : dateText(phase.starts_at);

/** "now" or "on Nov 1, 2026", for section summaries. */
export const phaseSummaryLabel = (
	phase: SetPlansPreviewPhase,
): SetPlansReviewText =>
	phase.starts_now ? ["now"] : reviewText("on ", dateText(phase.starts_at));

export const withoutEmptyPhases = (
	phases: SetPlansReviewSection["phases"],
): SetPlansReviewSection["phases"] =>
	phases.filter((phase) => phase.rows.length > 0);
