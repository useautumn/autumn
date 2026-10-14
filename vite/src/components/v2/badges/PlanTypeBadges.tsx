import { PlanTypeBadge } from "./PlanTypeBadge";

interface PlanTypeBadgesProduct {
	is_default?: boolean;
	free_trial?: unknown;
	is_add_on?: boolean;
}

interface PlanTypeBadgesProps {
	product: PlanTypeBadgesProduct;
	className?: string;
	iconOnly?: boolean;
	noIcon?: boolean;
	size?: "default" | "sm";
}

export const PlanTypeBadges = ({
	product,
	className,
	iconOnly = false,
	noIcon = false,
	size = "default",
}: PlanTypeBadgesProps) => {
	const badges = [];

	if (product.is_default && product.free_trial) {
		badges.push(
			<PlanTypeBadge
				key="autoTrial"
				variant="autoTrial"
				className={className}
				iconOnly={iconOnly}
				noIcon={noIcon}
				size={size}
			/>,
		);
	} else {
		if (product.is_default) {
			badges.push(
				<PlanTypeBadge
					key="default"
					variant="default"
					className={className}
					iconOnly={iconOnly}
					noIcon={noIcon}
					size={size}
				/>,
			);
		}

		if (product.free_trial) {
			badges.push(
				<PlanTypeBadge
					key="freeTrial"
					variant="freeTrial"
					className={className}
					iconOnly={iconOnly}
					noIcon={noIcon}
					size={size}
				/>,
			);
		}
	}

	if (product.is_add_on) {
		badges.push(
			<PlanTypeBadge
				key="addon"
				variant="addon"
				className={className}
				iconOnly={iconOnly}
				noIcon={noIcon}
				size={size}
			/>,
		);
	}

	if (badges.length === 0) {
		return null;
	}

	return <div className="flex flex-row items-center gap-1">{badges}</div>;
};
