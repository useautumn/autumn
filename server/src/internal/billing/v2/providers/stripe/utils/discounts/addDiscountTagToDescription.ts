const DISCOUNT_TAG = "[inc. discount]";

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
