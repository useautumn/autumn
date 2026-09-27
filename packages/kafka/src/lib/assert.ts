export function assertNonEmpty({
	name,
	value,
}: {
	name: string;
	value: string;
}): void {
	if (value.trim().length === 0) throw new Error(`${name} cannot be empty`);
}

export function assertPositiveSafeInteger({
	name,
	value,
}: {
	name: string;
	value: number;
}): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new RangeError(`${name} must be a positive safe integer`);
	}
}
