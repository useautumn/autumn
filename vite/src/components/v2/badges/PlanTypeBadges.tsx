import type { ProductV2 } from "@autumn/shared";
import { PlanTypeBadge } from "./PlanTypeBadge";

interface PlanTypeBadgesProps {
	product: ProductV2;
	className?: string;
}

export const PlanTypeBadges = ({ product, className }: PlanTypeBadgesProps) => {
	const badges = [];

	if (product.is_default) {
		badges.push(
			<PlanTypeBadge key="default" variant="default" className={className} />,
		);
	}

	if (product.free_trial) {
		badges.push(
			<PlanTypeBadge
				key="freeTrial"
				variant="freeTrial"
				className={className}
			/>,
		);
	}

	if (product.is_add_on) {
		badges.push(
			<PlanTypeBadge key="addon" variant="addon" className={className} />,
		);
	}

	if (badges.length === 0) {
		return null;
	}

	return <div className="flex flex-row items-center gap-1">{badges}</div>;
};
