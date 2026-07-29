export const readableVariantTestId = (label: string) => {
	return label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 48);
};
