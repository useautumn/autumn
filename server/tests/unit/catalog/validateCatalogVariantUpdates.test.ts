import { expect, test } from "bun:test";
import type { CatalogUpdateParams, FullProduct } from "@autumn/shared";
import { validateCatalogVariantVersionTargets } from "@/internal/catalog/actions/validateCatalogVariantUpdates.js";

const product = ({
	baseInternalProductId = null,
	id,
	version,
}: {
	baseInternalProductId?: string | null;
	id: string;
	version: number;
}) =>
	({
		id,
		version,
		base_internal_product_id: baseInternalProductId,
	}) as FullProduct;

const params = ({
	version,
}: {
	version?: number;
}): CatalogUpdateParams =>
	({
		features: [],
		plans: [
			{
				plan_id: "pro",
				...(version !== undefined ? { version } : {}),
				variants: [
					{
						variant_plan_id: "pro_annual",
						name: "Pro Annual",
						customize: {},
					},
				],
			},
		],
		skip_deletions: true,
		skip_feature_ids: [],
		skip_plan_ids: [],
	}) as CatalogUpdateParams;

test("catalog variant updates must target the latest base version", () => {
	const products = [product({ id: "pro", version: 2 })];

	expect(() =>
		validateCatalogVariantVersionTargets({
			params: params({ version: 1 }),
			products,
		}),
	).toThrow("latest version");

	expect(() =>
		validateCatalogVariantVersionTargets({
			params: params({ version: 2 }),
			products,
		}),
	).not.toThrow();

	expect(() =>
		validateCatalogVariantVersionTargets({
			params: params({}),
			products,
		}),
	).not.toThrow();
});
