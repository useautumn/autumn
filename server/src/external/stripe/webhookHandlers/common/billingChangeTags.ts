/**
 * Helper for tasks to push tags onto an eventContext. Tags are surfaced on
 * the `billing.updated` webhook payload as `tags: string[]`.
 *
 * Only call this when the tag's condition is actually detected — tags should
 * describe what happened, not every event.
 */

export type BillingChangeTaggable = { billingChangeTags: Set<string> };

export const addBillingChangeTag = (
	eventContext: BillingChangeTaggable,
	tag: string,
): void => {
	eventContext.billingChangeTags.add(tag);
};
