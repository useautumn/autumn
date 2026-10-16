import {
	type BillingPreviewChange,
	type FullCusProduct,
	InternalError,
} from "@autumn/shared";

/**
 * The plan row behind each preview change, in order. A plan repeated across
 * phases takes its rows in turn, as the preview listed them; a miss is a bug.
 */
export const matchChangesToCustomerProducts = ({
	changes,
	customerProducts,
}: {
	changes: BillingPreviewChange[];
	customerProducts: FullCusProduct[];
}): FullCusProduct[] => {
	const unmatched = [...customerProducts];
	return changes.map((change) => {
		const index = unmatched.findIndex(
			({ product }) => product.id === change.plan_id,
		);
		if (index === -1) {
			throw new InternalError({
				message: `Approval facts: no billing plan row for preview plan ${change.plan_id}`,
			});
		}
		return unmatched.splice(index, 1)[0];
	});
};
