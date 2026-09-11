/** Last-writer-wins merge; returns undefined when both sides are empty. */
export const mergeByKey = <T>({
	base,
	incoming,
	getKey,
}: {
	base?: T[];
	incoming?: T[];
	getKey: (item: T) => string;
}): T[] | undefined => {
	if (!base?.length && !incoming?.length) return undefined;

	const itemByKey = new Map<string, T>();
	for (const item of base ?? []) itemByKey.set(getKey(item), item);
	for (const item of incoming ?? []) itemByKey.set(getKey(item), item);

	return Array.from(itemByKey.values());
};

export const mergeById = <T extends { id: string }>({
	base,
	incoming,
}: {
	base?: T[];
	incoming?: T[];
}): T[] => mergeByKey({ base, incoming, getKey: (item) => item.id }) ?? [];
