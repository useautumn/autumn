import { PlusSquareIcon } from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";
import { DefaultIcon, FreeTrialIcon } from "@/components/v2/icons/AutumnIcons";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] text-tiny font-medium w-fit shrink-0",
	{
		variants: {
			variant: {
				default: "bg-muted text-body-secondary",
				freeTrial: "bg-muted text-body-secondary",
				addon: "bg-muted text-body-secondary",
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
				return <DefaultIcon size={14} color="#666666" hideTitle />;
			case "freeTrial":
				return <FreeTrialIcon size={14} color="#666666" hideTitle />;
			case "addon":
				return <PlusSquareIcon size={14} color="#666666" />;
			default:
				return <DefaultIcon size={14} color="#666666" hideTitle />;
		}
	};

	const getLabel = () => {
		switch (variant) {
			case "default":
				return "Default";
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
