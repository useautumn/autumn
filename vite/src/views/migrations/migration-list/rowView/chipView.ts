import type { FeatureType } from "@autumn/shared";
import type { StatusGlyph, StatusTone } from "@autumn/ui";

/** One StatusChip: an optional coloured tile, a label and muted text around it. */
export type ChipView = {
	label: string;
	tile?: { tone: StatusTone; glyph: StatusGlyph };
	prefix?: string;
	details?: string[];
};

/** Table cells stay quiet; only hover detail carries the coloured tile. */
export const withoutTile = ({ tile: _tile, ...chip }: ChipView): ChipView =>
	chip;

export type MigrationCatalog = {
	planName: (planId: string) => string;
	feature: (featureId: string) => {
		name: string;
		type: FeatureType | undefined;
		tile: NonNullable<ChipView["tile"]>;
	};
	formatAmount: (amount: number) => string;
};

/** A chip list capped for a hover card; `moreCount` feeds a trailing "+N more" chip. */
export type CappedChips = { chips: ChipView[]; moreCount: number };

const CHIP_LIST_LIMIT = 3;

export const capChips = (chips: ChipView[]): CappedChips => ({
	chips: chips.slice(0, CHIP_LIST_LIMIT),
	moreCount: Math.max(chips.length - CHIP_LIST_LIMIT, 0),
});

export const pluralize = ({
	count,
	noun,
}: {
	count: number;
	noun: string;
}): string =>
	`${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "s"}`;
