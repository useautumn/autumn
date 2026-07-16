import { type ProductItem, ProductItemSchema } from "@autumn/shared";

const PLAN_ITEM_CLIPBOARD_TYPE = "autumn/plan-item";

/** Strips backend-persisted ids so a pasted item is treated as a new row. */
const toClipboardItem = (item: ProductItem): ProductItem => ({
	...item,
	created_at: undefined,
	entitlement_id: undefined,
	price_id: undefined,
	price_interval: undefined,
	price_interval_count: undefined,
	price_config: undefined,
	feature: undefined,
	display: undefined,
});

export const copyPlanItemToClipboard = async ({
	item,
}: {
	item: ProductItem;
}) => {
	const payload = {
		type: PLAN_ITEM_CLIPBOARD_TYPE,
		item: toClipboardItem(item),
	};
	await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
};

export const parsePlanItemClipboardText = (
	text: string,
): ProductItem | null => {
	let payload: unknown;
	try {
		payload = JSON.parse(text);
	} catch {
		return null;
	}

	if (
		typeof payload !== "object" ||
		payload === null ||
		(payload as { type?: unknown }).type !== PLAN_ITEM_CLIPBOARD_TYPE
	) {
		return null;
	}

	// try/catch since ProductItemSchema preprocess steps can throw past safeParse
	try {
		const result = ProductItemSchema.safeParse(
			(payload as { item?: unknown }).item,
		);
		return result.success ? result.data : null;
	} catch {
		return null;
	}
};
