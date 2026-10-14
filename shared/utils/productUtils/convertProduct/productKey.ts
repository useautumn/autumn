export type ProductKey = {
	planId: string;
	version: number;
};

export const productKeyToString = ({
	productKey,
}: {
	productKey: ProductKey;
}): string => `${productKey.planId}@${productKey.version}`;
