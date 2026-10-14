export type EditType = "config" | "prepaid" | "trial" | "version" | "item";

export type EditIconType =
	| "price"
	| "tier"
	| "usage"
	| "units"
	| "prepaid"
	| "trial"
	| "version"
	| "item";

export interface ItemEdit {
	id: string;
	type: EditType;
	label: string;
	icon: EditIconType;
	description: string;
	oldValue: string | number | null;
	newValue: string | number | null;
	isUpgrade: boolean;
	editable?: boolean;
}
