import { useCallback, useRef } from "react";
import { slugify } from "@/utils/formatUtils/formatTextUtils";

// utility type: restricts to keys where value is string
type StringKeys<T> = {
	[K in keyof T]: T[K] extends string ? K : never;
}[keyof T];

type UseAutoSlugProps<T, S extends StringKeys<T>, U extends StringKeys<T>> = {
	state: T;
	setState: (updater: T) => void;
	sourceKey: S;
	targetKey: U;
};

export function useAutoSlug<
	T,
	S extends StringKeys<T>,
	U extends StringKeys<T>,
>({ state, setState, sourceKey, targetKey }: UseAutoSlugProps<T, S, U>) {
	const targetManuallyChangedRef = useRef(false);

	const setSource = useCallback(
		(newSource: string) => {
			const updates: T = {
				...state,
				[sourceKey]: newSource as T[S],
			};

			if (!targetManuallyChangedRef.current) {
				updates[targetKey] = slugify(newSource) as T[U];
			}

			setState(updates);
		},
		[state, setState, sourceKey, targetKey],
	);

	const setTarget = useCallback(
		(newTarget: string) => {
			targetManuallyChangedRef.current = true;
			setState({
				...state,
				[targetKey]: newTarget as T[U],
			});
		},
		[state, setState, targetKey],
	);

	return { setSource, setTarget };
}
