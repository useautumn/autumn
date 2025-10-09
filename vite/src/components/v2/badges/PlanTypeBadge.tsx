import { PlusSquareIcon } from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";
import { DefaultIcon, FreeTrialIcon } from "@/components/v2/icons/AutumnIcons";
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
}

export const PlanTypeBadge = ({ variant, className }: PlanTypeBadgeProps) => {
	const getIcon = () => {
		switch (variant) {
			case "default":
				return <DefaultIcon size={14} color="#666666" />;
			case "freeTrial":
				return <FreeTrialIcon size={14} color="#666666" />;
			case "addon":
				return <PlusSquareIcon size={14} color="#666666" />;
			default:
				return <DefaultIcon size={14} color="#666666" />;
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

	return (
		<div className={cn(badgeVariants({ variant }), className)}>
			{getIcon()}
			<span>{getLabel()}</span>
		</div>
	);
};
