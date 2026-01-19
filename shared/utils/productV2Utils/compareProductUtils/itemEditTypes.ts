/** Type of change being made */
export type EditType = "config" | "prepaid" | "trial" | "version" | "item";

/** Icon type for visual representation of the edit */
export type EditIconType =
	| "price"
	| "tier"
	| "usage"
	| "units"
	| "prepaid"
	| "trial"
	| "version"
	| "item";

/** Represents a single edit/change to a subscription or product item */
export interface ItemEdit {
	id: string;
	type: EditType;
	label: string;
	/** Icon type for the edit */
	icon: EditIconType;
	/** Full sentence description for display */
	description: string;
	oldValue: string | number | null;
	newValue: string | number | null;
	/** Whether this is an upgrade (true) or downgrade (false) */
	isUpgrade: boolean;
	/** Whether this edit has an inline editor (prepaid quantity) */
	editable?: boolean;
}
