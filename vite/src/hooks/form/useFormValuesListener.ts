import { useEffect, useRef } from "react";

type ValuesStore<TValues> = {
	state: { values: TValues };
	subscribe: (listener: () => void) => { unsubscribe: () => void };
};

/**
 * Calls `onChange` whenever a form store's values change, without re-rendering
 * the component that owns the form.
 *
 * TanStack's form-level `listeners.onChange` only fires for fields mounted via
 * `<form.Field>`, so stores driven by `setFieldValue` need a subscription
 * instead. Reading the values through `useStore` here would re-render the
 * owner on every keystroke, remounting the editor beneath it and dropping
 * input focus — so the subscription stays out of the render path entirely.
 */
export const useFormValuesListener = <TValues>({
	store,
	onChange,
}: {
	store: ValuesStore<TValues>;
	onChange?: (values: TValues) => void;
}) => {
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	useEffect(() => {
		let previous = store.state.values;
		const subscription = store.subscribe(() => {
			const next = store.state.values;
			if (next === previous) return;
			previous = next;
			onChangeRef.current?.(next);
		});
		return () => subscription.unsubscribe();
	}, [store]);
};
