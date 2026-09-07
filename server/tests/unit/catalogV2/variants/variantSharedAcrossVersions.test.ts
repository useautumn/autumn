/**
 * Versioning a base plan without versioning its variant leaves two stated base
 * rows pointing at one variant row, and the last upsert silently wins. The
 * update is refused instead, in preview and in update alike.
 */

import { expect, test } from "bun:test";
import {
	ErrCode,
	type RecaseError,
	type UpdateCatalogParams,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { handleVariantSharedAcrossVersionsErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleVariantSharedAcrossVersionsErrors";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

const row = ({
	planId,
	version,
	active,
	baseInternalId = null,
}: {
	planId: string;
	version: number;
	active: boolean;
	baseInternalId?: string | null;
}) => ({
	...products.createFull({ id: planId }),
	entitlements: [],
	prices: [],
	free_trial: null,
	internal_id: `internal_${planId}_v${version}`,
	version,
	version_slug: `v${version}`,
	active,
	base_internal_product_id: baseInternalId,
});

/** pro@v1 with pro_yearly@v1 anchored to it — the catalog before the push. */
const linkedCatalog = (): ProductStatesContext => {
	const base = row({ planId: "pro", version: 1, active: true });
	const variant = row({
		planId: "pro_yearly",
		version: 1,
		active: true,
		baseInternalId: base.internal_id,
	});
	return {
		versionsByPlanId: { pro: [base], pro_yearly: [variant] },
		statesByPlanVersion: {},
		rewardProgramsByPlanId: {},
	} as unknown as ProductStatesContext;
};

/** The CLI states the follow beside every declared variant, pin included. */
const statedVersion = ({
	versionSlug,
	active,
	variantVersionSlug,
}: {
	versionSlug: string;
	active: boolean;
	variantVersionSlug?: string;
}) => ({
	plan_id: "pro",
	version_slug: versionSlug,
	active,
	variants: [
		{
			variant_plan_id: "pro_yearly",
			name: "Pro Yearly",
			...(variantVersionSlug ? { version_slug: variantVersionSlug } : {}),
		},
	],
	propagate: {
		variants: [
			{
				plan_id: "pro_yearly",
				...(variantVersionSlug ? { version_slug: variantVersionSlug } : {}),
			},
		],
	},
});

const statedPlans = ({
	newVersionVariantSlug,
	historyVariantSlug,
}: {
	newVersionVariantSlug?: string;
	historyVariantSlug?: string;
}): NonNullable<UpdateCatalogParams["plans"]> =>
	[
		statedVersion({
			versionSlug: "v2",
			active: true,
			variantVersionSlug: newVersionVariantSlug,
		}),
		statedVersion({
			versionSlug: "v1",
			active: false,
			variantVersionSlug: historyVariantSlug,
		}),
	] as unknown as NonNullable<UpdateCatalogParams["plans"]>;

const refusalFor = ({
	plans,
}: {
	plans: NonNullable<UpdateCatalogParams["plans"]>;
}): RecaseError | undefined => {
	try {
		handleVariantSharedAcrossVersionsErrors({
			params: { plans } as unknown as UpdateCatalogParams,
			productStatesContext: linkedCatalog(),
		});
	} catch (error) {
		return error as RecaseError;
	}
	return undefined;
};

test("two stated versions of a base linking one variant row are refused", () => {
	const error = refusalFor({ plans: statedPlans({}) });

	expect(error?.message).toBe(
		"pro_yearly v1 is linked from pro v2 and pro v1. When versioning a base plan with variants linked, you also need to version the variant, and relink the new version to the new variant version.",
	);
	expect(error?.code).toBe(ErrCode.ConflictingVariantAnchor);
	expect(error?.statusCode).toBe(400);
});

test("versioning the variant alongside the base is accepted", () => {
	expect(
		refusalFor({
			plans: statedPlans({
				newVersionVariantSlug: "v2",
				historyVariantSlug: "v1",
			}),
		}),
	).toBeUndefined();
});

test("one version owning the variant is accepted", () => {
	const [newVersion, history] = statedPlans({});
	expect(
		refusalFor({
			plans: [
				newVersion,
				{ ...history, variants: [], propagate: { variants: [] } },
			] as NonNullable<UpdateCatalogParams["plans"]>,
		}),
	).toBeUndefined();
});
