import type { Product } from "../../../models/productModels/productModels.js";
import {
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
