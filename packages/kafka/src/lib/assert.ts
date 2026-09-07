export function assertNonEmpty({
	name,
	value,
}: {
	name: string;
	value: string;
}): void {
	if (value.trim().length === 0) throw new Error(`${name} cannot be empty`);
}
