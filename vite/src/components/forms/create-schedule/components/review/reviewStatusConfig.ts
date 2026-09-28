import { NEUTRAL_STATUS_ICON_CLASS } from "@autumn/ui";
import {
	AlertTriangleIcon,
	CheckIcon,
	MinusIcon,
	PencilIcon,
	PlusIcon,
	RefreshCwIcon,
	RotateCcwIcon,
	XIcon,
} from "lucide-react";
import type { ReviewChangeStatus } from "../../utils/review/types/reviewChange";

type ReviewStatusConfig = {
	icon: React.ElementType;
	label: string;
	iconClassName: string;
};

const POSITIVE_ICON_CLASS = "bg-green-600 dark:bg-green-500";
const NEGATIVE_ICON_CLASS = "bg-red-500";
const ATTENTION_ICON_CLASS = "bg-amber-500";
const INFO_ICON_CLASS = "bg-blue-500";

export const REVIEW_STATUS_CONFIG: Record<
	ReviewChangeStatus,
	ReviewStatusConfig
> = {
	starts: {
		icon: PlusIcon,
		label: "Starts",
		iconClassName: POSITIVE_ICON_CLASS,
	},
	ends: { icon: XIcon, label: "Ends", iconClassName: NEGATIVE_ICON_CLASS },
	kept: {
		icon: CheckIcon,
		label: "Kept",
		iconClassName: NEUTRAL_STATUS_ICON_CLASS,
	},
	updated: {
		icon: PencilIcon,
		label: "Updated",
		iconClassName: INFO_ICON_CLASS,
	},
	added: { icon: PlusIcon, label: "Added", iconClassName: POSITIVE_ICON_CLASS },
	removed: {
		icon: MinusIcon,
		label: "Removed",
		iconClassName: NEGATIVE_ICON_CLASS,
	},
	reset: {
		icon: RotateCcwIcon,
		label: "Resets",
		iconClassName: ATTENTION_ICON_CLASS,
	},
	carried: {
		icon: RefreshCwIcon,
		label: "Carried over",
		iconClassName: INFO_ICON_CLASS,
	},
	unmanaged: {
		icon: AlertTriangleIcon,
		label: "Not in Autumn",
		iconClassName: ATTENTION_ICON_CLASS,
	},
};
