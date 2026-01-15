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
}

export const PlanTypeBadges = ({
	product,
	className,
	iconOnly = false,
	noIcon = false,
}: PlanTypeBadgesProps) => {
	const badges = [];

	// If both auto-enabled and free trial, show combined "Auto trial" badge
	if (product.is_default && product.free_trial) {
		badges.push(
			<PlanTypeBadge
				key="autoTrial"
				variant="autoTrial"
				className={className}
				iconOnly={iconOnly}
				noIcon={noIcon}
			/>,
		);
	} else {
		// Otherwise, show individual badges
		if (product.is_default) {
			badges.push(
				<PlanTypeBadge
					key="default"
					variant="default"
					className={className}
					iconOnly={iconOnly}
					noIcon={noIcon}
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
			/>,
		);
	}

	if (badges.length === 0) {
		return null;
	}

	return <div className="flex flex-row items-center gap-1">{badges}</div>;
};
