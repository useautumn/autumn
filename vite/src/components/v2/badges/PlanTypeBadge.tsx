import { Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import {
	ClockIcon,
	PlusCircleIcon,
	RadioButtonIcon,
} from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";
import { DefaultIcon } from "@/components/v2/icons/AutumnIcons";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center gap-1 rounded-[6px] text-tertiary-foreground font-medium w-fit shrink-0 bg-muted",
	{
		variants: {
			variant: {
				default: "bg-muted",
				freeTrial: "bg-muted",
				addon: "bg-muted",
				autoTrial: "bg-muted",
			},
			size: {
				default: "px-1.5 py-0.5 text-sm",
				sm: "px-1 py-0 text-tiny gap-0.5",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

interface PlanTypeBadgeProps extends VariantProps<typeof badgeVariants> {
	className?: string;
	iconOnly?: boolean;
	noIcon?: boolean;
}

export const PlanTypeBadge = ({
	variant,
	size,
	className,
	iconOnly,
	noIcon,
}: PlanTypeBadgeProps) => {
	const isSmall = size === "sm";
	const iconSize = isSmall ? 11 : 14;

	const getIcon = () => {
		switch (variant) {
			case "default":
				return (
					<RadioButtonIcon
						size={iconSize}
						className="text-subtle mt-0.25"
						weight="fill"
					/>
				);
			case "freeTrial":
				return (
					<ClockIcon
						size={iconSize - 1}
						className="text-subtle mt-0.25"
						weight="fill"
					/>
				);
			case "addon":
				return (
					<PlusCircleIcon
						size={iconSize - 1}
						className="text-subtle mt-0.25"
						weight="fill"
					/>
				);
			case "autoTrial":
				return (
					<>
						<RadioButtonIcon
							size={iconSize}
							className="text-subtle mt-0.25"
							weight="fill"
						/>
						<ClockIcon
							size={iconSize - 1}
							className="text-subtle mt-0.25"
							weight="fill"
						/>
					</>
				);
			default:
				return <DefaultIcon size={iconSize} color="#666666" hideTitle />;
		}
	};

	const getLabel = () => {
		switch (variant) {
			case "default":
				return "Auto-enable";
			case "freeTrial":
				return "Free Trial";
			case "addon":
				return "Add-on";
			case "autoTrial":
				return "Auto-trial";
			default:
				return "Default";
		}
	};

	const getTooltipContent = () => {
		switch (variant) {
			case "default":
				return "This plan will enable by default for all new users.";
			case "freeTrial":
				return "This plan has a free trial period.";
			case "addon":
				return "This plan is an add-on that can be bought together with your base plans (eg, for top ups).";
			case "autoTrial":
				return "This plan will enable by default for all new users with a free trial period.";
		}
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={cn(
						badgeVariants({ variant, size }),
						className,
						"select-none",
					)}
				>
					{!noIcon && getIcon()}
					{!iconOnly && <span>{getLabel()}</span>}
				</div>
			</TooltipTrigger>

			{getTooltipContent() !== null && (
				<TooltipContent>{getTooltipContent()}</TooltipContent>
			)}
		</Tooltip>
	);
};
