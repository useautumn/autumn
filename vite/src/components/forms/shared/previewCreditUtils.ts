export const getPreviewCreditAmount = ({
	previewData,
}: {
	previewData?: {
		line_items?: { total: number }[];
	} | null;
}) => {
	const lineItems = previewData?.line_items ?? [];

	return Math.max(
		0,
		-lineItems.reduce((sum, lineItem) => sum + lineItem.total, 0),
	);
};
