/** Remounts a row when its plan changes, but not its scope: the open picker
 * would close the moment a scope tab is clicked. */
export const planRowKey = ({
	section,
	planIndex,
	productId,
}: {
	section: string;
	planIndex: number;
	productId: string | undefined;
}) => `${section}-${planIndex}-${productId ?? ""}`;
