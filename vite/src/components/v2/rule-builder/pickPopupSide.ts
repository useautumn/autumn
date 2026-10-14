export type PopupSide = "top" | "bottom";

const visibleBoundsOf = (element: Element) => {
	let top = 0;
	let bottom = window.innerHeight;
	for (let node = element.parentElement; node; node = node.parentElement) {
		if (!/(auto|scroll)/.test(getComputedStyle(node).overflowY)) continue;
		const rect = node.getBoundingClientRect();
		top = Math.max(top, rect.top);
		bottom = Math.min(bottom, rect.bottom);
	}
	return { top, bottom };
};

export const pickPopupSide = ({
	trigger,
	popupHeight,
}: {
	trigger: Element | undefined;
	popupHeight: number;
}): PopupSide => {
	if (!trigger) return "bottom";
	const rect = trigger.getBoundingClientRect();
	const bounds = visibleBoundsOf(trigger);
	const spaceBelow = bounds.bottom - rect.bottom;
	const spaceAbove = rect.top - bounds.top;
	if (spaceBelow >= popupHeight) return "bottom";
	if (spaceAbove >= popupHeight) return "top";
	return spaceAbove > spaceBelow ? "top" : "bottom";
};
