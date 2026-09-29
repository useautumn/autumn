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
		tile: NonNullable<ChipView["tile"]>;
	};
	formatAmount: (amount: number) => string;
};

export const pluralize = ({
	count,
	noun,
}: {
	count: number;
	noun: string;
}): string =>
	`${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "s"}`;
