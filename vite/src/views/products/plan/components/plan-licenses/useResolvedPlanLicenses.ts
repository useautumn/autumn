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
import { resolvePlanLicenseProduct } from "./resolvePlanLicenseProduct";

export interface ResolvedPlanLicense {
	planLicense: PlanLicense;
	license: ProductV2;
	isPendingLink: boolean;
}

export function useResolvedPlanLicenses(): ResolvedPlanLicense[] {
	const { product } = useProduct();
	const isLicense = useIsLicenseEditor();
	const productContext = useOptionalProductContext();
	const pageCatalogLicenses = productContext?.catalogLicenses;

	const { planLicenses: fallbackPlanLicenses } = usePlanLicensesQuery(
		isLicense || pageCatalogLicenses ? undefined : product?.id,
	);
	const { products } = useProductsQuery({ allVersions: true });
	const { pendingLicenseIds } = usePendingLicenseLinks();
	const initialPatches = useInitialLicensePatches();

	return useMemo(() => {
		if (isLicense || !product) return [];

		const licenseById = new Map(
			products.map((license) => [license.id, license]),
		);
		for (const license of products) {
			const latest = licenseById.get(license.id);
			if (!latest || license.version > latest.version) {
				licenseById.set(license.id, license);
			}
		}
		const persistedLicenses = pageCatalogLicenses
			? pageCatalogLicenses.map((entry) => ({ ...entry, isPendingLink: false }))
			: fallbackPlanLicenses.flatMap((planLicense) => {
					const license = resolvePlanLicenseProduct({
						products,
						planId: planLicense.license_plan_id,
						version: planLicense.version,
					});
					return license
						? [{ planLicense, license, isPendingLink: false }]
						: [];
				});

		const persistedIds = new Set(
			persistedLicenses.map(({ planLicense }) => planLicense.license_plan_id),
		);
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
