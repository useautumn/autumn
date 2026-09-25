const VISIBLE_SUFFIX_LENGTH = 6;

/** "sub_1Q2wXcAutumnDemo" → "sub_…XcDemo" so the chip stays compact. */
export const shortStripeId = (id: string) => {
	const separatorIndex = id.indexOf("_");
	const prefix = separatorIndex > 0 ? id.slice(0, separatorIndex + 1) : "";
	const body = id.slice(prefix.length);
	if (body.length <= VISIBLE_SUFFIX_LENGTH) return id;

	return `${prefix}…${body.slice(-VISIBLE_SUFFIX_LENGTH)}`;
};
