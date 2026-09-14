import type { CreditSchemaItem } from "@autumn/shared";

/** Row keys stay stable across edits: extra rows get fresh keys, removed rows drop theirs. */
export const keysForSchema = ({
	keys,
	length,
}: {
	keys: string[];
	length: number;
}): string[] => {
	const nextKeys = keys.slice(0, length);
	while (nextKeys.length < length) nextKeys.push(crypto.randomUUID());
	return nextKeys;
};

export const removeSchemaItemAt = ({
	schema,
	keys,
	index,
}: {
	schema: CreditSchemaItem[];
	keys: string[];
	index: number;
}): { schema: CreditSchemaItem[]; keys: string[] } => ({
	schema: schema.filter((_, i) => i !== index),
	keys: keys.filter((_, i) => i !== index),
});

/** A row opens for editing the moment its feature is picked; other edits leave the accordion alone. */
export const expandedKeyAfterItemChange = ({
	previous,
	next,
	rowKey,
	current,
}: {
	previous: CreditSchemaItem;
	next: CreditSchemaItem;
	rowKey: string;
	current: string | null;
}): string | null => {
	const featurePicked =
		!previous.metered_feature_id && Boolean(next.metered_feature_id);
	return featurePicked ? rowKey : current;
};
