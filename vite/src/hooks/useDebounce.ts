import { useEffect, useState } from "react";

/**
 * Debounce any value change by a configurable delay.
 */
export function useDebounce<T>({
	value,
	delayMs,
}: {
	value: T;
	delayMs: number;
}): T {
	const [debouncedValue, setDebouncedValue] = useState(value);

	useEffect(() => {
		const timeoutId = setTimeout(() => {
			setDebouncedValue(value);
		}, delayMs);

		return () => {
			clearTimeout(timeoutId);
		};
	}, [value, delayMs]);

	return debouncedValue;
}
