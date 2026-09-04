export const replaceAt = <T>(list: T[], index: number, next: T): T[] =>
	list.map((current, i) => (i === index ? next : current));

export const removeAt = <T>(list: T[], index: number): T[] =>
	list.filter((_, i) => i !== index);

export const without = (values: string[], value: string): string[] =>
	values.filter((current) => current !== value);
