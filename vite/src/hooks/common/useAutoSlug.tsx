import { useCallback, useRef } from "react";
import { slugify } from "@/utils/formatUtils/formatTextUtils";

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
	const targetManuallyChangedRef = useRef(false);

	const setSource = useCallback(
		(newSource: string) => {
			const updater = (prevState: T) => {
				const updates: T = {
					...prevState,
					[sourceKey]: newSource as T[S],
				};

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
			targetManuallyChangedRef.current = true;
			const updater = (prevState: T) => ({
				...prevState,
				[targetKey]: newTarget as T[U],
			});
			setState(updater);
		},
		[setState, targetKey],
	);

	const resetAutoSlug = useCallback(() => {
		targetManuallyChangedRef.current = false;
	}, []);

	return { setSource, setTarget, resetAutoSlug };
}
