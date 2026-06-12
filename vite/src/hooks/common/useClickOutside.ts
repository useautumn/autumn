import { type RefObject, useEffect, useRef } from "react";

export function useClickOutside({
	ref,
	onClickOutside,
	enabled = true,
}: {
	ref: RefObject<HTMLElement | null>;
	onClickOutside: () => void;
	enabled?: boolean;
}): void {
	const callbackRef = useRef(onClickOutside);
	callbackRef.current = onClickOutside;

	useEffect(() => {
		if (!enabled) return;

		const onPointerDown = (event: PointerEvent) => {
			const element = ref.current;
			if (element && !element.contains(event.target as Node)) {
				callbackRef.current();
			}
		};

		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [ref, enabled]);
}
