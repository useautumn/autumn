import type { CatalogStripeMapping } from "@autumn/shared";
import { Badge } from "@autumn/ui";
import {
	CheckCircleIcon,
	CircleDashedIcon,
	ClockClockwiseIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const statusConfig = {
	ok: {
		label: "Verified",
		icon: CheckCircleIcon,
		className: "bg-green-500/10 text-green-500 border-transparent",
	},
	unmapped: {
		label: "Unmapped",
		icon: CircleDashedIcon,
		className: "bg-muted text-tertiary-foreground border-border/50",
	},
	unchecked: {
		label: "Unchecked",
		icon: ClockClockwiseIcon,
		className: "bg-muted text-tertiary-foreground border-border/50",
	},
	missing: {
		label: "Missing",
		icon: WarningCircleIcon,
		className: "bg-red-500/10 text-red-500 border-transparent",
	},
	inactive: {
		label: "Inactive",
		icon: WarningCircleIcon,
		className: "bg-amber-500/10 text-amber-500 border-transparent",
	},
	conflict: {
		label: "Mixed",
		icon: WarningCircleIcon,
		className: "bg-amber-500/10 text-amber-500 border-transparent",
	},
} satisfies Record<
	CatalogStripeMapping["status"],
	{
		label: string;
		icon: typeof CheckCircleIcon;
		className: string;
	}
>;

export const MappingStatusBadge = ({
	status,
	className,
}: {
	status: CatalogStripeMapping["status"];
	className?: string;
}) => {
	const config = statusConfig[status];
	const Icon = config.icon;

	return (
		<Badge
			variant="muted"
			size="sm"
			className={cn(
				"gap-1 transition-colors duration-150",
				config.className,
				className,
			)}
		>
			<Icon size={11} weight="fill" />
			{config.label}
		</Badge>
	);
};
