/**
 * A variants[] entry with no version pin resolves to the variant row anchored
 * to the base row it sits under, never to the variant's active row. Once pro@v2
 * and proYearly@v2 are active, the v1 history base still owns proYearly@v1; a
 * base no row points at mints its own.
 */

import { expect, test } from "bun:test";
import {
	ErrCode,
	type RecaseError,
	type UpdateCatalogParams,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import { selectVariantRows } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/selectVariantRows";
import { handleDeclaredVariantAnchorErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleDeclaredVariantAnchorErrors";
import { handleVariantSharedAcrossVersionsErrors } from "@/internal/catalogV2/actions/updateCatalog/errors/handleVariantSharedAcrossVersionsErrors";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { variantRowForDeclaredEntry } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/anchoredVariantRow";
import { variantEntryMintsRow } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/variantEntryMintsRow";

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

/** pro@v1 (history) → proYearly@v1, pro@v2 (active) → proYearly@v2. */
const versionedCatalog = (): ProductStatesContext => {
	const proV1 = row({ planId: "pro", version: 1, active: false });
	const proV2 = row({ planId: "pro", version: 2, active: true });
	const yearlyV1 = row({
		planId: "proYearly",
		version: 1,
		active: false,
		baseInternalId: proV1.internal_id,
	});
	const yearlyV2 = row({
		planId: "proYearly",
		version: 2,
		active: true,
		baseInternalId: proV2.internal_id,
	});
	return {
		versionsByPlanId: { pro: [proV1, proV2], proYearly: [yearlyV1, yearlyV2] },
		statesByPlanVersion: {},
		rewardProgramsByPlanId: {},
	} as unknown as ProductStatesContext;
};

const statedBase = ({
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
			variant_plan_id: "proYearly",
			name: "Pro Yearly",
			...(variantVersionSlug ? { version_slug: variantVersionSlug } : {}),
		},
	],
});

const refusalFor = ({
	check,
	plans,
}: {
	check: typeof handleDeclaredVariantAnchorErrors;
	plans: unknown[];
}): RecaseError | undefined => {
	try {
		check({
			params: { plans } as unknown as UpdateCatalogParams,
			productStatesContext: versionedCatalog(),
		});
	} catch (error) {
		return error as RecaseError;
	}
	return undefined;
};

test("an unpinned entry under the history base resolves to the row anchored to it", () => {
	const productStatesContext = versionedCatalog();
	const resolved = variantRowForDeclaredEntry({
		variant: { variant_plan_id: "proYearly" },
		anchorInternalIds: new Set(["internal_pro_v1"]),
		productStatesContext,
	});
	expect(resolved?.internal_id).toBe("internal_proYearly_v1");

	const rows = selectVariantRows({
		planId: "proYearly",
		anchorInternalIds: new Set(["internal_pro_v1"]),
		productStatesContext,
	});
	expect(rows.map((product) => product.internal_id)).toEqual([
		"internal_proYearly_v1",
	]);
});

test("an unpinned entry under a base no row points at names no row: it mints, never borrows the active one", () => {
	const productStatesContext = versionedCatalog();
	const anchorInternalIds = new Set(["internal_pro_v3"]);
	expect(
		variantRowForDeclaredEntry({
			variant: { variant_plan_id: "proYearly" },
			anchorInternalIds,
			productStatesContext,
		}),
	).toBeNull();
	expect(
		variantEntryMintsRow({
			variant: { variant_plan_id: "proYearly", name: "Pro Yearly" },
			anchorInternalIds,
			productStatesContext,
		}),
	).toBe(true);
	expect(
		variantEntryMintsRow({
			variant: { variant_plan_id: "proYearly", name: "Pro Yearly" },
			anchorInternalIds: new Set(["internal_pro_v1"]),
			productStatesContext,
		}),
	).toBe(false);
});

test("an unpinned entry naming a standalone plan takes its active row (first link)", () => {
	const standalone = row({ planId: "solo", version: 1, active: true });
	const productStatesContext = {
		versionsByPlanId: { solo: [standalone] },
		statesByPlanVersion: {},
		rewardProgramsByPlanId: {},
	} as unknown as ProductStatesContext;
	expect(
		variantRowForDeclaredEntry({
			variant: { variant_plan_id: "solo" },
			anchorInternalIds: new Set(["internal_pro_v1"]),
			productStatesContext,
		})?.internal_id,
	).toBe("internal_solo_v1");
});

test("a pinned entry ignores the anchor and takes the named row", () => {
	const resolved = variantRowForDeclaredEntry({
		variant: { variant_plan_id: "proYearly", version_slug: "v2" },
		anchorInternalIds: new Set(["internal_pro_v1"]),
		productStatesContext: versionedCatalog(),
	});
	expect(resolved?.internal_id).toBe("internal_proYearly_v2");
});

test("a slug-less history entry beside a pinned active entry is accepted", () => {
	const plans = [
		statedBase({ versionSlug: "v2", active: true, variantVersionSlug: "v2" }),
		statedBase({ versionSlug: "v1", active: false }),
	];
	expect(
		refusalFor({ check: handleDeclaredVariantAnchorErrors, plans }),
	).toBeUndefined();
	expect(
		refusalFor({ check: handleVariantSharedAcrossVersionsErrors, plans }),
	).toBeUndefined();
});

test("two unpinned entries, each under its own base, are accepted", () => {
	const plans = [
		statedBase({ versionSlug: "v2", active: true }),
		statedBase({ versionSlug: "v1", active: false }),
	];
	expect(
		refusalFor({ check: handleDeclaredVariantAnchorErrors, plans }),
	).toBeUndefined();
	expect(
		refusalFor({ check: handleVariantSharedAcrossVersionsErrors, plans }),
	).toBeUndefined();
});

test("two bases pinning the same variant row are still refused", () => {
	const plans = [
		statedBase({ versionSlug: "v2", active: true, variantVersionSlug: "v1" }),
		statedBase({ versionSlug: "v1", active: false, variantVersionSlug: "v1" }),
	];
	const error = refusalFor({ check: handleDeclaredVariantAnchorErrors, plans });
	expect(error?.message).toBe(
		"Variant proYearly cannot be declared under two different base rows",
	);
	expect(error?.code).toBe(ErrCode.ConflictingVariantAnchor);
	expect(error?.statusCode).toBe(400);
});
