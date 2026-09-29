import type {
	PreviewBalance,
	PreviewBalanceChange,
	SetPlansPreviewBalanceChange,
} from "@autumn/shared";

/** `previous_attributes` is sparse, so the before-state is it overlaid on the after-state. */
const balanceBefore = (change: PreviewBalanceChange): PreviewBalance => ({
	...change.balance,
	...(change.previous_attributes as Partial<PreviewBalance>),
});

const balanceBehavior = ({
	before,
	after,
}: {
	before: PreviewBalance;
	after: PreviewBalance;
}): SetPlansPreviewBalanceChange["behavior"] => {
	if (!before.unlimited && after.unlimited) return "added";
	if (before.unlimited && !after.unlimited && after.granted === 0) {
		return "removed";
	}
	if (before.granted === 0 && before.usage === 0 && after.granted > 0) {
		return "added";
	}
	if (after.granted === 0 && before.granted > 0) return "removed";
	if (before.usage > 0 && after.usage === 0) return "reset";
	if (after.usage > 0 && after.usage === before.usage) return "carried";
	return "updated";
};

export const classifySetPlansBalanceChange = (
	change: PreviewBalanceChange,
): SetPlansPreviewBalanceChange => ({
	...change,
	behavior: balanceBehavior({
		before: balanceBefore(change),
		after: change.balance,
	}),
});
