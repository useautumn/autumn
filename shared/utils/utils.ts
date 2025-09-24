export const nullish = <T>(
	value: T | null | undefined,
): value is null | undefined => {
	return value === null || value === undefined;
};

export const notNullish = <T>(value: T | null | undefined): value is T =>
	value !== null && value !== undefined;
