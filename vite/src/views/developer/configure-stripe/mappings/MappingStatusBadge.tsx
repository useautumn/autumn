import type { CatalogStripeMapping } from "@autumn/shared";
import { StatusChip, StatusChipIcon } from "@autumn/ui";
import {
	CheckIcon,
	CircleDashedIcon,
	ClockClockwiseIcon,
	ExclamationMarkIcon,
	type Icon,
} from "@phosphor-icons/react";

const NEUTRAL_ICON_CLASS = "bg-zinc-400 dark:bg-zinc-500";

const statusConfig = {
	ok: {
		label: "Verified",
		icon: CheckIcon,
		className: "bg-green-500",
	},
	unmapped: {
		label: "Unmapped",
		icon: CircleDashedIcon,
		className: NEUTRAL_ICON_CLASS,
	},
	unchecked: {
		label: "Unchecked",
		icon: ClockClockwiseIcon,
		className: NEUTRAL_ICON_CLASS,
	},
	missing: {
		label: "Missing",
		icon: ExclamationMarkIcon,
		className: "bg-red-500",
	},
	inactive: {
		label: "Inactive",
		icon: ExclamationMarkIcon,
		className: "bg-amber-500",
	},
	conflict: {
		label: "Mixed",
		icon: ExclamationMarkIcon,
		className: "bg-amber-500",
	},
} satisfies Record<
	CatalogStripeMapping["status"],
	{
		label: string;
		icon: Icon;
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
	const StatusIcon = config.icon;

	return (
		<StatusChip
			className={className}
			indicator={
				<StatusChipIcon
					icon={<StatusIcon weight="bold" />}
					className={config.className}
				/>
			}
		>
			{config.label}
		</StatusChip>
	);
};
