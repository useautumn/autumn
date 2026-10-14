export const planRowKey = ({
	section,
	planIndex,
	productId,
}: {
	section: string;
	planIndex: number;
	productId: string | undefined;
}) => `${section}-${planIndex}-${productId ?? ""}`;
