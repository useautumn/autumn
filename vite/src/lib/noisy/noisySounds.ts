import { bind, type Emphasis } from "cuelume";

interface CueRule {
	readonly selector: string;
	readonly attribute: string;
	readonly emphasis?: Emphasis;
}

/** First match wins, so specific controls sit above the generic tap. */
const CUE_RULES: CueRule[] = [
	{
		selector:
			'[data-slot="switch"], [data-slot="checkbox"], [role="switch"], [role="checkbox"], input[type="checkbox"]',
		attribute: "data-cuelume-toggle",
	},
	{
		selector:
			'[data-slot="select-item"], [data-slot="dropdown-menu-item"], [data-slot="dropdown-menu-checkbox-item"], [data-slot="dropdown-menu-radio-item"], [data-slot="command-item"], [data-slot="radio-group-item"], [role="tab"], [role="option"], [role="radio"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], select',
		attribute: "data-cuelume-select",
	},
	{
		selector: '[data-slot="dialog-close"], [data-slot="sheet-close"]',
		attribute: "data-cuelume-close",
	},
	{
		selector: 'button[class~="bg-destructive"]',
		attribute: "data-cuelume-close",
		emphasis: "strong",
	},
	{
		selector:
			'[data-slot="dialog-trigger"], [data-slot="sheet-trigger"], [data-slot="popover-trigger"], [data-slot="dropdown-menu-trigger"], [data-slot="select-trigger"], [aria-haspopup]:not([aria-haspopup="false"])',
		attribute: "data-cuelume-open",
		emphasis: "subtle",
	},
	{
		selector: '[data-slot="main-sidebar"] a[href]',
		attribute: "data-cuelume-navigate",
		emphasis: "subtle",
	},
	{
		selector: 'button, a[href], [role="button"], summary',
		attribute: "data-cuelume-tap",
	},
];

const TYPING_SELECTOR =
	'textarea, [contenteditable="true"], [contenteditable=""], input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="number"], input[type="tel"]';

const CUE_SELECTOR = CUE_RULES.map(({ selector }) => selector).join(", ");

const TAGGED_SELECTOR = [
	...new Set(CUE_RULES.map(({ attribute }) => `[${attribute}]`)),
].join(", ");

const tag = ({ element, rule }: { element: Element; rule: CueRule }) => {
	element.setAttribute(rule.attribute, "");
	if (rule.emphasis)
		element.setAttribute("data-cuelume-emphasis", rule.emphasis);
};

// Cuelume only sounds elements carrying data-cuelume-*, so tag each control on its first interaction.
const tagActivatedControl = (event: Event) => {
	if (!(event.target instanceof Element)) return;
	const element = event.target.closest(CUE_SELECTOR);
	if (!element || element.matches(TAGGED_SELECTOR)) return;
	const rule = CUE_RULES.find(({ selector }) => element.matches(selector));
	if (!rule) return;
	tag({ element, rule });

	// Select cues pitch by position among marked siblings, so mark the whole group.
	if (rule.attribute !== "data-cuelume-select") return;
	for (const sibling of element.parentElement?.children ?? []) {
		if (sibling.matches(rule.selector) && !sibling.matches(TAGGED_SELECTOR))
			tag({ element: sibling, rule });
	}
};

const tagTypingField = (event: Event) => {
	const field = event.target;
	if (!(field instanceof Element) || !field.matches(TYPING_SELECTOR)) return;
	field.setAttribute("data-cuelume-type", "");
};

/** Window capture runs before cuelume's document listeners, so tags land before it reads them. */
export function startNoisySounds(): () => void {
	const listeners = new AbortController();
	const options = { capture: true, signal: listeners.signal };
	for (const type of ["pointerdown", "click", "change"])
		window.addEventListener(type, tagActivatedControl, options);
	window.addEventListener("keydown", tagTypingField, options);
	const unbind = bind();

	return () => {
		listeners.abort();
		unbind();
	};
}
