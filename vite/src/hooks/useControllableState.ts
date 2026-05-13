import { useCallback, useRef, useState } from "react";

type UseControllableStateParams<T> = {
	prop?: T;
	defaultProp?: T;
	onChange?: (value: T) => void;
};

/**
 * Manages state that can be either controlled or uncontrolled.
 * Replacement for @radix-ui/react-use-controllable-state.
 */
function useControllableState<T>({
	prop,
	defaultProp,
	onChange,
}: UseControllableStateParams<T>): [T | undefined, (value: T) => void] {
	const [uncontrolled, setUncontrolled] = useState(defaultProp);
	const isControlled = prop !== undefined;
	const value = isControlled ? prop : uncontrolled;
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const setValue = useCallback(
		(nextValue: T) => {
			if (!isControlled) {
				setUncontrolled(nextValue);
			}
			onChangeRef.current?.(nextValue);
		},
		[isControlled],
	);

	return [value, setValue];
}

export { useControllableState };
