import type { BillingControlKey } from "../../../models/cusModels/billingControls/customerBillingControls.js";
import type { Product } from "../../../models/productModels/productModels.js";
import {
	compareBillingControls,
	compareConfig,
	compareMetadata,
} from "../../productV2Utils/compareProductUtils/compareProductUtils.js";

export const PRODUCT_DETAIL_KEYS = [
	"id",
	"name",
	"description",
	"group",
	"is_add_on",
	"is_default",
	"archived",
	"config",
	"metadata",
	"auto_topups",
	"spend_limits",
	"usage_limits",
	"usage_alerts",
	"overage_allowed",
] as const;

export type ProductDetailKey = (typeof PRODUCT_DETAIL_KEYS)[number];

type DetailComparator<K extends ProductDetailKey> = (params: {
	left: Product[K];
	right: Product[K];
}) => boolean;

const strictEqual =
	<K extends ProductDetailKey>(): DetailComparator<K> =>
	({ left, right }) =>
		left === right;

/** JSONB round-trips reorder object keys; sort so compareBillingControls is stable. */
const stabilizeBillingControlColumn = (
	value: unknown,
): unknown => {
	if (value == null) return undefined;
	if (!Array.isArray(value)) return value;

	const stabilize = (entry: unknown): unknown => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			return entry;
		}
		return Object.keys(entry as Record<string, unknown>)
			.sort()
			.reduce<Record<string, unknown>>((acc, objectKey) => {
				acc[objectKey] = stabilize(
					(entry as Record<string, unknown>)[objectKey],
				);
				return acc;
			}, {});
	};

	return value.map(stabilize);
};

/** null/undefined/[] + spend_limits normalize via compareBillingControls. */
const billingControlColumnIsSame =
	<K extends BillingControlKey>(key: K): DetailComparator<K> =>
	({ left, right }) =>
		compareBillingControls({
			newBillingControls: {
				[key]: stabilizeBillingControlColumn(left),
			},
			curBillingControls: {
				[key]: stabilizeBillingControlColumn(right),
			},
		});

/**
 * Explicit per-field equivalence for product detail columns.
 * The diff and the boolean derive from this one map so they can never drift.
 */
export const productDetailComparators: {
	[K in ProductDetailKey]: DetailComparator<K>;
} = {
	id: strictEqual(),
	name: strictEqual(),
	description: ({ left, right }) => (left ?? null) === (right ?? null),
	group: strictEqual(),
	is_add_on: strictEqual(),
	is_default: strictEqual(),
	archived: strictEqual(),
	config: ({ left, right }) =>
		compareConfig({ newConfig: left, curConfig: right }),
	metadata: ({ left, right }) =>
		compareMetadata({ newMetadata: left, curMetadata: right }),
	auto_topups: billingControlColumnIsSame("auto_topups"),
	spend_limits: billingControlColumnIsSame("spend_limits"),
	usage_limits: billingControlColumnIsSame("usage_limits"),
	usage_alerts: billingControlColumnIsSame("usage_alerts"),
	overage_allowed: billingControlColumnIsSame("overage_allowed"),
};

export const productDetailFieldIsSame = <K extends ProductDetailKey>({
	key,
	product1,
	product2,
}: {
	key: K;
	product1: Product;
	product2: Product;
}): boolean =>
	productDetailComparators[key]({
		left: product1[key],
		right: product2[key],
	});

export const productDetailsAreSame = ({
	product1,
	product2,
}: {
	product1: Product;
	product2: Product;
}): boolean =>
	PRODUCT_DETAIL_KEYS.every((key) =>
		productDetailFieldIsSame({ key, product1, product2 }),
	);
