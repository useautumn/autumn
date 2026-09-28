import {
	AlertTriangleIcon,
	BanIcon,
	CalendarIcon,
	CheckIcon,
	ClockIcon,
	HourglassIcon,
	PauseIcon,
	XIcon,
} from "lucide-react";
import type { PlanStatus } from "./resolvePlanStatus";

type PlanStatusConfig = {
	icon: React.ElementType;
	label: string;
	iconClassName: string;
};

export const PLAN_STATUS_CONFIG: Record<PlanStatus, PlanStatusConfig> = {
	active: {
		icon: CheckIcon,
		label: "Active",
		iconClassName: "bg-green-600 dark:bg-green-500",
	},
	trialing: {
		icon: ClockIcon,
		label: "Trial",
		iconClassName: "bg-blue-500",
	},
	canceling: {
		icon: BanIcon,
		label: "Cancelling",
		iconClassName: "bg-orange-500",
	},
	past_due: {
		icon: AlertTriangleIcon,
		label: "Past due",
		iconClassName: "bg-red-500",
	},
	scheduled: {
		icon: CalendarIcon,
		label: "Scheduled",
		iconClassName: "bg-purple-500",
	},
	paused: {
		icon: PauseIcon,
		label: "Paused",
		iconClassName: "bg-yellow-500",
	},
	expired: {
		icon: XIcon,
		label: "Expired",
		iconClassName: "bg-zinc-400 dark:bg-zinc-600",
	},
	pending: {
		icon: HourglassIcon,
		label: "Pending",
		iconClassName: "bg-zinc-400 dark:bg-zinc-500",
	},
};
