import { formatMoney } from "../format.js";
import { asRecord, getArray, getNumber, getString } from "../records.js";
import { itemMatchesFilter } from "./itemMatchesFilter.js";

type PriceShape = Record<string, unknown>;
type ItemShape = Record<string, unknown>;

/** One customer-specific change to a plan. Every change is an add or a
 * remove: the verb is a property of the diff against the current plan, never
 * a label chosen by a surface. Removes carry what is actually being removed. */
export type CustomizeChange =
	| { kind: "add" | "remove"; subject: "price"; price: PriceShape }
	| { kind: "add" | "remove"; subject: "item"; item: ItemShape };

const currentItems = (currentPlan: unknown): ItemShape[] =>
	getArray(asRecord(currentPlan)?.items).flatMap((item) => {
		const record = asRecord(item);
		return record ? [record] : [];
	});

const priceChanges = ({
	currentPlan,
	customize,
}: {
	currentPlan: unknown;
	customize: Record<string, unknown>;
}): CustomizeChange[] => {
	if (!("price" in customize)) return [];
	const currentPrice = asRecord(asRecord(currentPlan)?.price);
	const nextPrice = asRecord(customize.price);
	return [
		...(currentPrice
			? [
					{
						kind: "remove" as const,
						subject: "price" as const,
						price: currentPrice,
					},
				]
			: []),
		...(nextPrice
			? [{ kind: "add" as const, subject: "price" as const, price: nextPrice }]
			: []),
	];
};

/** `remove_items` entries are filters; each resolves to the current items it
 * matches so the row shows the quantity being removed. An unmatched filter
 * still names its feature rather than vanishing. */
const removedItems = ({
	currentPlan,
	filters,
}: {
	currentPlan: unknown;
	filters: unknown;
}): ItemShape[] =>
	getArray(filters).flatMap((filter) => {
		const matches = currentItems(currentPlan).filter((item) =>
			itemMatchesFilter({ filter, item }),
		);
		if (matches.length) return matches;
		const filterRecord = asRecord(filter);
		return filterRecord ? [filterRecord] : [];
	});

const addedItems = (value: unknown): ItemShape[] =>
	getArray(value).flatMap((item) => {
		const record = asRecord(item);
		return record ? [record] : [];
	});

const itemChanges = ({
	currentPlan,
	customize,
}: {
	currentPlan: unknown;
	customize: Record<string, unknown>;
}): CustomizeChange[] => {
	// `items` is PUT-style: the new list replaces every current item.
	const replacing = Array.isArray(customize.items);
	const removed = replacing
		? currentItems(currentPlan)
		: removedItems({ currentPlan, filters: customize.remove_items });
	const added = replacing
		? addedItems(customize.items)
		: addedItems(customize.add_items);
	return [
		...removed.map((item) => ({
			kind: "remove" as const,
			subject: "item" as const,
			item,
		})),
		...added.map((item) => ({
			kind: "add" as const,
			subject: "item" as const,
			item,
		})),
	];
};

/** The customer-specific terms of a billing action as adds and removes
 * against the current plan. Removes precede adds so a table reads old → new. */
export const buildCustomizeChanges = ({
	currentPlan,
	customize,
}: {
	/** The plan being changed (`outgoing[].plan` or the live subscription),
	 * or null for a fresh attach where nothing is current. */
	currentPlan: unknown;
	customize: unknown;
}): CustomizeChange[] => {
	const patch = asRecord(customize);
	if (!patch) return [];
	const price = priceChanges({ currentPlan, customize: patch });
	const items = itemChanges({ currentPlan, customize: patch });
	return [
		...price.filter((change) => change.kind === "remove"),
		...items.filter((change) => change.kind === "remove"),
		...price.filter((change) => change.kind === "add"),
		...items.filter((change) => change.kind === "add"),
	];
};

/** "$80.00 per month" for a base-price shape, or null when there is no amount. */
export const customPriceText = (value: unknown): string | null => {
	const price = asRecord(value);
	const amount = getNumber(price?.amount);
	if (price === null || amount === null) return null;
	const interval = getString(price.interval);
	const intervalCount = getNumber(price.interval_count);
	const cadence = interval
		? ` per ${intervalCount && intervalCount > 1 ? `${intervalCount} ${interval}s` : interval}`
		: "";
	return `${formatMoney({ amount, currency: getString(price.currency) })}${cadence}`;
};
