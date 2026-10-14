export type BillingChangeTaggable = { billingChangeTags: Set<string> };

export const addBillingChangeTag = (
	eventContext: BillingChangeTaggable,
	tag: string,
): void => {
	eventContext.billingChangeTags.add(tag);
};
