export const SYNCABLE_EVENT_PREFIXES = [
	"customer.subscription.",
	"payment_intent.",
	"invoice.",
	"customer.",
	"product.",
	"price.",
] as const;

export const isSyncableEvent = ({
	eventType,
}: {
	eventType: string;
}): boolean => {
	return SYNCABLE_EVENT_PREFIXES.some((prefix) => eventType.startsWith(prefix));
};
