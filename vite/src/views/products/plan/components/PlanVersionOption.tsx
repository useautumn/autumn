import {
	IconBadge,
	SmallSpinner,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { UserIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export const ActiveVersionDot = ({ active }: { active: boolean }) => {
	if (!active) {
		return <span className="size-1.5 shrink-0 rounded-full bg-transparent" />;
	}

	return (
		<Tooltip>
			<TooltipTrigger render={<span className="flex shrink-0" />}>
				<span className="size-1.5 rounded-full bg-green-500">
					<span className="sr-only">Active version</span>
				</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-64">
				This version is active. Attaching this plan by ID uses it by default.
			</TooltipContent>
		</Tooltip>
	);
};

export const PlanVersionOption = ({
	label,
	active,
	selected,
	count,
	countLoaded,
}: {
	label: string;
	active: boolean;
	selected: boolean;
	count: number;
	countLoaded: boolean;
}) => (
	<div className="flex w-full items-center justify-between gap-4">
		<span className="flex min-w-0 items-center gap-2">
			<ActiveVersionDot active={active} />
			<span
				className={cn(
					"truncate",
					selected ? "text-foreground font-medium" : "text-muted-foreground",
				)}
			>
				{label}
			</span>
		</span>
		{countLoaded ? (
			<IconBadge className="shrink-0" variant="muted" icon={<UserIcon />}>
				{count}
			</IconBadge>
		) : (
			<SmallSpinner size={10} className="shrink-0 text-tertiary-foreground" />
		)}
	</div>
);
