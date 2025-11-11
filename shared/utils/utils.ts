export const nullish = <T>(
	value: T | null | undefined,
): value is null | undefined => {
	return value === null || value === undefined;
};

export const notNullish = <T>(value: T | null | undefined): value is T =>
	value !== null && value !== undefined;

export const idRegex = /^[a-zA-Z0-9_-]+$/;

export const sumValues = (vals: number[]) => {
	return vals.reduce((acc, curr) => acc + curr, 0);
};

export const keyToTitle = (
	key: string,
	options?: { exclusionMap?: Record<string, string> },
) => {
	if (options?.exclusionMap?.[key]) {
		return options.exclusionMap[key];
	}
	return key
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
};

export const addToExpand = <T extends { expand: string[] }>({
	ctx,
	add,
}: {
	ctx: T;
	add: string[];
}): T => {
	return {
		...ctx,
		expand: [...ctx.expand, ...add],
	};
};
