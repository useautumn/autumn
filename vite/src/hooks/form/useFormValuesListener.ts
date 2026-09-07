import { useEffect, useRef } from "react";

type ValuesStore<TValues> = {
	state: { values: TValues };
	subscribe: (listener: () => void) => { unsubscribe: () => void };
};

// Subscribes outside render: useStore here would drop input focus on every keystroke.
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
