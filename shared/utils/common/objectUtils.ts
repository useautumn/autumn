export const isEmptyObject = (value: object): boolean =>
	Object.keys(value).length === 0;

export const mapRecordValues = <T, U>({
	record,
	mapValue,
}: {
	record: Record<string, T>;
	mapValue: (value: T) => U;
}): Record<string, U> =>
	Object.fromEntries(
		Object.entries(record).map(([key, value]) => [key, mapValue(value)]),
	);
