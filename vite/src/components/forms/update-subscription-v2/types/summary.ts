import type { ProductItem } from "@autumn/shared";

export interface SummaryItem {
	id: string;
	type: "prepaid" | "trial";
	label: string;
	description: string;
	oldValue: string | number | null;
	newValue: string | number | null;
	costDelta?: number;
	currency?: string;
	/** The product item for rendering icons (prepaid changes only) */
	productItem?: ProductItem;
}
