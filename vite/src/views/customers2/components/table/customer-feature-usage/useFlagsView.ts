import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import { useState } from "react";
import { useMeasuredHeight } from "@/hooks/useMeasuredHeight";
import { useOverflowCount } from "@/hooks/useOverflowCount";
import { FLAG_PILL_GAP } from "./FlagPill";

type FlagsViewState = { showingCatalog: boolean; expanded: boolean };

export function useFlagsView({
	booleanEnts,
	hasCatalog,
}: {
	booleanEnts: FullCusEntWithFullCusProduct[];
	hasCatalog: boolean;
}) {
	const [state, setState] = useState<FlagsViewState>({
		showingCatalog: false,
		expanded: false,
	});
	const { showingCatalog, expanded } = state;
	if (!hasCatalog && showingCatalog) {
		setState({ ...state, showingCatalog: false });
	}

	const { containerRef, measureRef, visibleCount } = useOverflowCount({
		itemCount: booleanEnts.length,
		gap: FLAG_PILL_GAP,
		hasIndicator: true,
	});

	const { ref: rowRef, height: measuredHeight } =
		useMeasuredHeight<HTMLDivElement>();

	const isCollapsed = !showingCatalog && !expanded;
	const visibleEnts = isCollapsed
		? booleanEnts.slice(0, visibleCount)
		: booleanEnts;

	return {
		showingCatalog,
		expanded,
		isCollapsed,
		visibleEnts,
		hiddenCount: booleanEnts.length - visibleEnts.length,
		hasOverflow: !showingCatalog && visibleCount < booleanEnts.length,
		rowHeight: measuredHeight ?? "auto",
		containerRef,
		measureRef,
		rowRef,
		setShowingCatalog: (showingCatalog: boolean) =>
			setState((prev) => ({ ...prev, showingCatalog })),
		toggleExpanded: () =>
			setState((prev) => ({ ...prev, expanded: !prev.expanded })),
	};
}
