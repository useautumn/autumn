export const checkoutToUrl = ({
	checkoutBaseUrl = "http://localhost:3001",
	checkoutId,
}: {
	checkoutBaseUrl?: string;
	checkoutId: string;
}): string => `${checkoutBaseUrl}/c/${checkoutId}`;
