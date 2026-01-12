const DISCOUNT_TAG = "[inc. discount]";

/** Suffixes "[inc. discount]" to description if not already present */
export const addDiscountTagToDescription = ({
	description,
}: {
	description: string;
}): string => {
	if (description.includes(DISCOUNT_TAG)) {
		return description;
	}
	return `${description} ${DISCOUNT_TAG}`;
};
