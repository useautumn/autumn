export const getPreviousValues = <T extends object, U extends object>({
	before,
	updates,
}: {
	before: T;
	updates: U;
}): U =>
	Object.fromEntries(
		Object.keys(updates).map((key) => [key, before[key as keyof T]]),
	) as U;
