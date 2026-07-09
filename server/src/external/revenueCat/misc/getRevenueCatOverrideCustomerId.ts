const OVERRIDE_ATTRIBUTE_KEY = "autumn_customer_id";
const EMAIL_ATTRIBUTE_KEY = "autumn_customer_email";
const FINGERPRINT_ATTRIBUTE_KEY = "autumn_customer_fingerprint";

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

/** Canonical Autumn customer email the client declares via the `autumn_customer_email` RC subscriber attribute. */
export const getRevenueCatCustomerEmail = (
	event: WithSubscriberAttributes,
): string | undefined => {
	const value =
		event.subscriber_attributes?.[EMAIL_ATTRIBUTE_KEY]?.value?.trim();
	return value ? value : undefined;
};

/** Canonical Autumn customer fingerprint the client declares via the `autumn_customer_fingerprint` RC subscriber attribute. */
export const getRevenueCatCustomerFingerprint = (
	event: WithSubscriberAttributes,
): string | undefined => {
	const value =
		event.subscriber_attributes?.[FINGERPRINT_ATTRIBUTE_KEY]?.value?.trim();
	return value ? value : undefined;
};
