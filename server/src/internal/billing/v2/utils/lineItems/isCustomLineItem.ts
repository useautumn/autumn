import type { LineItem } from "@autumn/shared";

/** Lines from add_lines or custom_line_items carry an empty price; generated lines always have a config. */
export const isCustomLineItem = (lineItem: LineItem) =>
	!lineItem.context.price.config;
