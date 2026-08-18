/** Identity of one product row (plan_id @ version). */
export type ProductKey = {
	planId: string;
	version: number;
};

/** Stable string form for maps / claim-sets: `pro@2`. */
export const productKeyToString = ({
	productKey,
}: {
	productKey: ProductKey;
}): string => `${productKey.planId}@${productKey.version}`;
