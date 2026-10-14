export const pickChangedFields = <T extends object>({
	from,
	to,
}: {
	from: T;
	to: T;
}): Partial<T> =>
	Object.fromEntries(
		Object.entries(to).filter(
			([field, value]) =>
				JSON.stringify(value) !== JSON.stringify(from[field as keyof T]),
		),
	) as Partial<T>;
