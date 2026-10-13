export type PopupSide = "top" | "bottom";

/** The trigger's room on screen: the viewport narrowed by every scrolling ancestor, like a sheet body. */
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

/** Below if the whole popup fits there, else above if it fits there, else whichever side has more room. */
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
