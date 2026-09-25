import {
	ArrowsClockwiseIcon,
	CalendarDotsIcon,
	ChartBarIcon,
	type Icon,
	PackageIcon,
	PuzzlePieceIcon,
	TagIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { ReviewChangeIcon } from "../../utils/review/types/reviewChange";

const ICONS: Record<ReviewChangeIcon, Icon> = {
	plan: PackageIcon,
	addOn: PuzzlePieceIcon,
	balance: ChartBarIcon,
	subscription: ArrowsClockwiseIcon,
	schedule: CalendarDotsIcon,
	item: TagIcon,
};

export function ReviewChangeIconGlyph({
	icon,
	isEnding,
}: {
	icon: ReviewChangeIcon;
	isEnding?: boolean;
}) {
	const IconComponent = ICONS[icon];

	return (
		<IconComponent
			size={14}
			className={cn(
				"shrink-0",
				isEnding ? "text-subtle" : "text-tertiary-foreground",
			)}
		/>
	);
}
