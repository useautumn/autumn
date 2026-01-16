import type { ProductItem } from "@autumn/shared";

export interface SummaryItem {
	id: string;
	type: "prepaid" | "trial" | "version" | "item";
	label: string;
	oldValue: string | number | null;
	newValue: string | number | null;
	costDelta?: number;
	currency?: string;
	/** The product item for rendering icons (prepaid and item changes) */
	productItem?: ProductItem;
}

export type EditIconType = "price" | "tier" | "usage" | "units" | "prepaid";

export interface ItemEdit {
	id: string;
	type: "config" | "prepaid";
	label: string;
	/** Icon type for the edit */
	icon: EditIconType;
	/** Full sentence description for accordion display */
	description: string;
	oldValue: string | number | null;
	newValue: string | number | null;
	/** Whether this is an upgrade (true) or downgrade (false) */
	isUpgrade: boolean;
	/** Whether this edit has an inline editor (prepaid quantity) */
	editable?: boolean;
}
