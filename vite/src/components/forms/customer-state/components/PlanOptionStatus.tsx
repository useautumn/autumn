import type { SubscriptionConflict } from "../utils/findSubscriptionConflict";
import { SubscriptionConflictHoverCard } from "./SubscriptionConflictHoverCard";

/** Why a plan can't be picked; a subscription conflict opens a card on hover. */
export function PlanOptionStatus({
	isSelectedElsewhere,
	isGroupUsed,
	subscriptionConflict,
	productName,
}: {
	isSelectedElsewhere: boolean;
	isGroupUsed: boolean;
	subscriptionConflict: SubscriptionConflict | null;
	productName: string;
}) {
	if (subscriptionConflict) {
		return (
			<SubscriptionConflictHoverCard
				productName={productName}
				conflict={subscriptionConflict}
			/>
		);
	}
	if (isSelectedElsewhere) {
		return (
			<span className="shrink-0 text-xs text-subtle">Already selected</span>
		);
	}
	if (isGroupUsed) {
		return <span className="shrink-0 text-xs text-subtle">Group conflict</span>;
	}
	return null;
}
