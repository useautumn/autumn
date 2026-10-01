const VISIBLE_SUFFIX_LENGTH = 4;
const VISIBLE_BODY_PREFIX_LENGTH = 4;

/** `sub_1QxAbcdefgh8aKd` → `sub_1QxA…8aKd`, keeping the type prefix whole. */
export const formatStripeObjectId = (stripeObjectId: string): string => {
	const bodyStart = stripeObjectId.lastIndexOf("_") + 1;
	const visibleLength =
		bodyStart + VISIBLE_BODY_PREFIX_LENGTH + VISIBLE_SUFFIX_LENGTH + 1;
	if (stripeObjectId.length <= visibleLength) return stripeObjectId;

	const head = stripeObjectId.slice(0, bodyStart + VISIBLE_BODY_PREFIX_LENGTH);
	const tail = stripeObjectId.slice(-VISIBLE_SUFFIX_LENGTH);
	return `${head}…${tail}`;
};
