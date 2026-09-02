import type {
	CreditDimension,
	CreditMultiplier,
	CreditSchemaItem,
} from "@autumn/shared";
import { Infinite } from "@autumn/shared";

/**
 * The dashboard edits dimensions as a price list keyed by ONE event property:
 * every rule matches exactly that property with one value. Rules that don't
 * fit (several keys, or keys that differ between rules) were written through
 * the API and are shown read-only.
 */

export type CreditPriceListRow = { value: string; dimension: CreditDimension };
export type CreditAdjustmentRow = {
	value: string;
	multiplier: CreditMultiplier;
};

export type CreditPriceList = {
	property: string;
	rows: CreditPriceListRow[];
};

export type CreditAdjustmentList = {
	property: string;
	rows: CreditAdjustmentRow[];
};

const singleKeyOf = (match: Record<string, string>): string | undefined => {
	const keys = Object.keys(match);
	return keys.length === 1 ? keys[0] : undefined;
};

const listByProperty = <T extends { match: Record<string, string> }>(
	rules: Record<string, T>,
): { property: string; rows: { value: string; rule: T }[] } | undefined => {
	const entries = Object.entries(rules);
	if (entries.length === 0) return { property: "", rows: [] };

	const property = singleKeyOf(entries[0][1].match);
	if (property === undefined) return undefined;
	const fitsOneProperty = entries.every(
		([, rule]) => singleKeyOf(rule.match) === property,
	);
	if (!fitsOneProperty) return undefined;

	return {
		property,
		rows: entries.map(([, rule]) => ({ value: rule.match[property], rule })),
	};
};

export const toPriceList = (
	item: CreditSchemaItem,
): CreditPriceList | undefined => {
	const list = listByProperty(item.dimensions ?? {});
	return (
		list && {
			property: list.property,
			rows: list.rows.map(({ value, rule }) => ({ value, dimension: rule })),
		}
	);
};

export const toAdjustmentList = (
	item: CreditSchemaItem,
): CreditAdjustmentList | undefined => {
	const list = listByProperty(item.multipliers ?? {});
	return (
		list && {
			property: list.property,
			rows: list.rows.map(({ value, rule }) => ({ value, multiplier: rule })),
		}
	);
};

export const isApiAuthored = (item: CreditSchemaItem): boolean =>
	toPriceList(item) === undefined || toAdjustmentList(item) === undefined;

const ruleName = ({ property, value }: { property: string; value: string }) =>
	`${property}_${value}`.replace(/[^a-zA-Z0-9_]+/g, "_").slice(0, 64) ||
	"value";

/** Duplicate values collapse to one rule, so names are made unique by suffix. */
const uniqueName = (name: string, taken: Set<string>) => {
	let candidate = name;
	let index = 2;
	while (taken.has(candidate)) candidate = `${name}_${index++}`;
	taken.add(candidate);
	return candidate;
};

const fromPriceList = (
	list: CreditPriceList,
): CreditSchemaItem["dimensions"] => {
	if (list.rows.length === 0) return undefined;
	const taken = new Set<string>();
	return Object.fromEntries(
		list.rows.map(({ value, dimension }) => [
			uniqueName(ruleName({ property: list.property, value }), taken),
			{ ...dimension, match: { [list.property]: value } },
		]),
	);
};

const fromAdjustmentList = (
	list: CreditAdjustmentList,
): CreditSchemaItem["multipliers"] => {
	if (list.rows.length === 0) return undefined;
	const taken = new Set<string>();
	return Object.fromEntries(
		list.rows.map(({ value, multiplier }) => [
			uniqueName(ruleName({ property: list.property, value }), taken),
			{ ...multiplier, match: { [list.property]: value } },
		]),
	);
};

export const withPriceList = ({
	item,
	list,
}: {
	item: CreditSchemaItem;
	list: CreditPriceList;
}): CreditSchemaItem => {
	const { dimensions: _dimensions, ...rest } = item;
	const dimensions = fromPriceList(list);
	return dimensions ? { ...rest, dimensions } : rest;
};

export const withAdjustmentList = ({
	item,
	list,
}: {
	item: CreditSchemaItem;
	list: CreditAdjustmentList;
}): CreditSchemaItem => {
	const { multipliers: _multipliers, ...rest } = item;
	const multipliers = fromAdjustmentList(list);
	return multipliers ? { ...rest, multipliers } : rest;
};

export const withoutDimensions = (item: CreditSchemaItem): CreditSchemaItem => {
	const { dimensions: _dimensions, multipliers: _multipliers, ...rest } = item;
	return rest;
};

export const createRateRow = (value: string): CreditPriceListRow => ({
	value,
	dimension: { match: {}, credit_amount: 0 },
});

export const createAdjustmentRow = (value: string): CreditAdjustmentRow => ({
	value,
	multiplier: { match: {}, factor: 1 },
});

export const rateKindOf = (dimension: CreditDimension): "flat" | "tiered" =>
	dimension.tier_behavior === "graduated" ? "tiered" : "flat";

/** Flat and tiered forbid each other's cost fields, so the switch rebuilds the rate. */
export const setRateKind = ({
	dimension,
	kind,
}: {
	dimension: CreditDimension;
	kind: "flat" | "tiered";
}): CreditDimension => {
	if (kind === rateKindOf(dimension)) return dimension;
	const base = {
		match: dimension.match,
		...(dimension.priority === undefined
			? {}
			: { priority: dimension.priority }),
	};
	if (kind === "tiered") {
		return {
			...base,
			tier_behavior: "graduated",
			tiers: [{ to: Infinite, credit_amount: dimension.credit_amount ?? 0 }],
		};
	}
	return { ...base, credit_amount: dimension.tiers?.[0]?.credit_amount ?? 0 };
};
