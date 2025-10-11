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

export const keyToTitle = (key: string) => {
	return key
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
};

// export const generateId = (prefix: string) => {
// 	if (!prefix) {
// 		return KSUID.randomSync().string;
// 	} else {
// 		return `${prefix}_${KSUID.randomSync().string}`;
// 	}
// };
