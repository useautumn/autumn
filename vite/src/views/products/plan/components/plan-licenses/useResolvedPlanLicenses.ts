import type { PlanLicense, ProductV2 } from "@autumn/shared";
import { useMemo } from "react";
import {
	useIsLicenseEditor,
	useProduct,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { usePlanLicensesQuery } from "@/hooks/queries/usePlanLicensesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useOptionalProductContext } from "@/views/products/product/ProductContext";
import { useInitialLicensePatches } from "./LicenseCustomizeCollector";
import {
	pendingPlanLicense,
	usePendingLicenseLinks,
} from "./PendingLicenseLinksContext";

export interface ResolvedPlanLicense {
	planLicense: PlanLicense;
	license: ProductV2;
	isPendingLink: boolean;
}

/**
 * Resolves a parent plan's licenses (persisted + staged) to their license
 * products, shared by the license cards and the parent-plan license rows.
 * Returns [] when the current editor is itself a license (licenses don't nest).
 */
export function useResolvedPlanLicenses(): ResolvedPlanLicense[] {
	const { product } = useProduct();
	const isLicense = useIsLicenseEditor();
	const productContext = useOptionalProductContext();
	const pageCatalogLicenses = productContext?.catalogLicenses;

	const { planLicenses: fallbackPlanLicenses } = usePlanLicensesQuery(
		isLicense || pageCatalogLicenses ? undefined : product?.id,
	);
	const { products } = useProductsQuery();
	const { pendingLicenseIds } = usePendingLicenseLinks();
	const initialPatches = useInitialLicensePatches();

	return useMemo(() => {
		if (isLicense || !product) return [];

		// Staged links can point at any plan, so fall back to the full plans list.
		const licenseById = new Map(
			products.map((license) => [license.id, license]),
		);
		const persistedLicenses = pageCatalogLicenses
			? pageCatalogLicenses.map((entry) => ({ ...entry, isPendingLink: false }))
			: fallbackPlanLicenses.flatMap((planLicense) => {
					const license = licenseById.get(planLicense.license_plan_id);
					return license
						? [{ planLicense, license, isPendingLink: false }]
						: [];
				});

		const persistedIds = new Set(
			persistedLicenses.map(({ planLicense }) => planLicense.license_plan_id),
		);
		// Patch keys cover links staged in a previous customize session — they
		// exist only in the saved patch, so resurface them as pending.
		const stagedIds = new Set(
			[...pendingLicenseIds, ...Object.keys(initialPatches)].filter(
				(licenseId) => !persistedIds.has(licenseId),
			),
		);
		const pendingPlanLicenses = [...stagedIds].map((licenseId) =>
			pendingPlanLicense({ licenseId, parentPlanId: product.id }),
		);
		const pendingLicenses = pendingPlanLicenses.flatMap((planLicense) => {
			const license = licenseById.get(planLicense.license_plan_id);
			if (!license) return [];
			return [{ planLicense, license, isPendingLink: true }];
		});

		return [...persistedLicenses, ...pendingLicenses];
	}, [
		isLicense,
		product,
		products,
		pageCatalogLicenses,
		fallbackPlanLicenses,
		pendingLicenseIds,
		initialPatches,
	]);
}
