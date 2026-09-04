import { SectionTag } from "@autumn/ui";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { PlanGroup } from "./catalogGrouping";
import { PlanCard } from "./PlanCard";
import { usePlanTrack, VISIBLE_PLANS } from "./usePlanTrack";

const GAP_PX = 6;
/** Sliver of the next card left visible, and the width of the edge fade. */
const PEEK_PX = 28;

function TrackButton({
	direction,
	disabled,
	onClick,
}: {
	direction: "prev" | "next";
	disabled: boolean;
	onClick: () => void;
}) {
	const Icon = direction === "prev" ? CaretLeftIcon : CaretRightIcon;

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-label={direction === "prev" ? "Previous plans" : "Next plans"}
			className={cn(
				"flex size-5 items-center justify-center rounded-md border text-tertiary-foreground",
				"transition-[transform,color,opacity] duration-150 ease-out active:scale-95",
				disabled
					? "cursor-default opacity-30"
					: "hover:text-foreground hover:bg-muted",
			)}
		>
			<Icon size={11} weight="bold" />
		</button>
	);
}

/**
 * A paged row of plan cards. Only the track's transform animates — card widths
 * are fixed, so nothing reflows and the text never re-wraps mid-slide.
 */
export function PlanTrack({
	group,
	currency,
}: {
	group: PlanGroup;
	currency?: string;
}) {
	const track = usePlanTrack({ count: group.cards.length });
	const isPaged = group.cards.length > VISIBLE_PLANS;

	// Paged tracks leave a sliver of the neighbouring card showing: a cut-off
	// card says "there's more" far louder than an arrow button does.
	const reserved = (VISIBLE_PLANS - 1) * GAP_PX + (isPaged ? PEEK_PX : 0);
	const cardWidth = `calc((100% - ${reserved}px) / ${VISIBLE_PLANS})`;
	const step = `calc(${cardWidth} + ${GAP_PX}px)`;

	// Fade whichever edge has cards behind it, so the peek reads as continuation
	// rather than a clipped bug.
	const fadeMask = [
		track.canGoPrev
			? `linear-gradient(to right, transparent, black ${PEEK_PX}px)`
			: null,
		track.canGoNext
			? `linear-gradient(to left, transparent, black ${PEEK_PX}px)`
			: null,
	].filter(Boolean) as string[];

	return (
		<div className="flex min-w-0 flex-col">
			<div className="flex items-center gap-2">
				<SectionTag>{group.label}</SectionTag>
				{isPaged && (
					<div className="mb-2 ml-auto flex items-center gap-1.5">
						<span className="text-tiny text-subtle tabular-nums">
							{track.offset + VISIBLE_PLANS} / {group.cards.length}
						</span>
						<TrackButton
							direction="prev"
							disabled={!track.canGoPrev}
							onClick={track.prev}
						/>
						<TrackButton
							direction="next"
							disabled={!track.canGoNext}
							onClick={track.next}
						/>
					</div>
				)}
			</div>

			<div
				className="min-w-0 overflow-hidden"
				style={
					fadeMask.length
						? {
								maskImage: fadeMask.join(", "),
								maskComposite: "intersect",
								WebkitMaskImage: fadeMask.join(", "),
								WebkitMaskComposite: "source-in",
							}
						: undefined
				}
			>
				{/* Matches the step panel's spring feel, so paging and expanding read
				    as the same interface. */}
				<div
					className="flex items-stretch transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
					style={{
						gap: `${GAP_PX}px`,
						transform: `translateX(calc(${track.offset} * -1 * ${step}))`,
					}}
				>
					{group.cards.map((card) => (
						<div
							key={card.plan.id}
							className="shrink-0"
							style={{
								width: isPaged ? cardWidth : undefined,
								flex: isPaged ? undefined : "1 1 0",
							}}
						>
							<PlanCard card={card} currency={currency} />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
