import type { FeatureType, UpdatePlanOp } from "@autumn/shared";
import type { StatusGlyph, StatusTone } from "@autumn/ui";
import type { migrationOpRateRows } from "@/utils/product/featureOverrideRates";

export type ChipView = {
	label: string;
	tile?: { tone: StatusTone; glyph: StatusGlyph };
	prefix?: string;
	details?: string[];
};

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
	rateRows: (op: UpdatePlanOp) => ReturnType<typeof migrationOpRateRows>;
};

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
