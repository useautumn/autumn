import {
	ClockIcon,
	PlusCircleIcon,
	RadioButtonIcon,
} from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";
import { DefaultIcon } from "@/components/v2/icons/AutumnIcons";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] text-sm text-t3 font-medium w-fit shrink-0 bg-muted",
	{
		variants: {
			variant: {
				default: "bg-muted",
				freeTrial: "bg-muted",
				addon: "bg-muted",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export interface PlanTypeBadgeProps extends VariantProps<typeof badgeVariants> {
	className?: string;
	iconOnly?: boolean;
}

export const PlanTypeBadge = ({
	variant,
	className,
	iconOnly,
}: PlanTypeBadgeProps) => {
	const getIcon = () => {
		switch (variant) {
			case "default":
				return (
					<RadioButtonIcon
						size={14}
						className="text-t4 mt-0.25"
						weight="fill"
					/>
				);
			case "freeTrial":
				return (
					<ClockIcon size={13} className="text-t4 mt-0.25" weight="fill" />
				);
			case "addon":
				return (
					<PlusCircleIcon size={13} className="text-t4 mt-0.25" weight="fill" />
				);
			default:
				return <DefaultIcon size={14} color="#666666" hideTitle />;
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
		}
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={cn(badgeVariants({ variant }), className, "select-none")}
				>
					{getIcon()}
					{!iconOnly && <span>{getLabel()}</span>}
				</div>
			</TooltipTrigger>

			{getTooltipContent() !== null && (
				<TooltipContent>{getTooltipContent()}</TooltipContent>
			)}
		</Tooltip>
	);
};
