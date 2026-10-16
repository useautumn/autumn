/** "a", "a and b", "a, b and c" (Intl.ListFormat isn't in the dashboard's TS lib). */
export const joinWithAnd = ({ items }: { items: string[] }) =>
	items.length <= 1
		? (items[0] ?? "")
		: `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
