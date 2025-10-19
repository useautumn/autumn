import { useCallback, useRef } from "react";
import { slugify } from "@/utils/formatUtils/formatTextUtils";

// utility type: restricts to keys where value is string
type StringKeys<T> = {
	[K in keyof T]: T[K] extends string ? K : never;
}[keyof T];

type UseAutoSlugProps<T, S extends StringKeys<T>, U extends StringKeys<T>> = {
	setState: (updater: T | ((prev: T) => T)) => void;
	sourceKey: S;
	targetKey: U;
	disableAutoSlug?: boolean;
};

export function useAutoSlug<
	T,
	S extends StringKeys<T>,
	U extends StringKeys<T>,
>({
	setState,
	sourceKey,
	targetKey,
	disableAutoSlug = false,
}: UseAutoSlugProps<T, S, U>) {
	// Initialize ref to false, not to disableAutoSlug
	// This tracks if user has manually changed the target field
	const targetManuallyChangedRef = useRef(false);

	const setSource = useCallback(
		(newSource: string) => {
			const updater = (prevState: T) => {
				const updates: T = {
					...prevState,
					[sourceKey]: newSource as T[S],
				};

				// Only auto-slug if:
				// 1. User hasn't manually changed the target field AND
				// 2. Auto-slug is not disabled
				if (!targetManuallyChangedRef.current && !disableAutoSlug) {
					updates[targetKey] = slugify(newSource) as T[U];
				}

				return updates;
			};
			setState(updater);
		},
		[setState, sourceKey, targetKey, disableAutoSlug],
	);

	const setTarget = useCallback(
		(newTarget: string) => {
			// Mark that user has manually changed the target
			targetManuallyChangedRef.current = true;
			const updater = (prevState: T) => ({
				...prevState,
				[targetKey]: newTarget as T[U],
			});
			setState(updater);
		},
		[setState, targetKey],
	);

	// Reset function to allow auto-slug to work again
	const resetAutoSlug = useCallback(() => {
		targetManuallyChangedRef.current = false;
	}, []);

	return { setSource, setTarget, resetAutoSlug };
}
