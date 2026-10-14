export const buildClaimMarkerKey = (lockReceiptKey: string): string =>
	`${lockReceiptKey}:claim`;
