const OVERRIDE_ATTRIBUTE_KEY = "autumn_customer_id";

type WithSubscriberAttributes = {
	subscriber_attributes?: Record<string, { value: string } | undefined>;
};

/** Canonical Autumn id the client declares via the `autumn_customer_id` RC subscriber attribute. */
export const getRevenueCatOverrideCustomerId = (
	event: WithSubscriberAttributes,
): string | undefined => {
	const value =
		event.subscriber_attributes?.[OVERRIDE_ATTRIBUTE_KEY]?.value?.trim();
	return value ? value : undefined;
};
