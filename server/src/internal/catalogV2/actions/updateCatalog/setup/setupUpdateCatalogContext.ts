import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupFeatureUsagePersisted } from "@/internal/catalogV2/actions/updateCatalog/setup/preview/setupFeatureUsagePersisted";
import { setupPlanUsagePersisted } from "@/internal/catalogV2/actions/updateCatalog/setup/preview/setupPlanUsagePersisted";
import { resolveInternalIdRefs } from "@/internal/catalogV2/actions/updateCatalog/setup/resolveInternalIdRefs";
import { setupFeatureStatesContext } from "@/internal/catalogV2/actions/updateCatalog/setup/setupFeatureStatesContext";
import { setupInvoiceCreditProducts } from "@/internal/catalogV2/actions/updateCatalog/setup/setupInvoiceCreditProducts";
import { setupLicenseStatesContext } from "@/internal/catalogV2/actions/updateCatalog/setup/setupLicenseStatesContext";
import { setupProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/setup/setupProductStatesContext";
import {
	type CatalogPhases,
	timeCatalogPhase,
} from "@/internal/catalogV2/actions/updateCatalog/setup/timeCatalogPhase";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

export const setupUpdateCatalogContext = async ({
	ctx,
	params,
	preview = false,
	phases,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
	preview?: boolean;
	phases: CatalogPhases;
}): Promise<UpdateCatalogContext> => {
	// Ahead of every load: a renamed row names a plan id that does not exist
	// yet, so setup cannot scope to it until the stated ids are resolved.
	const internalIdRefs = await timeCatalogPhase({
		ctx,
		phases,
		phase: "internal_id_refs",
		run: () => resolveInternalIdRefs({ ctx, params }),
	});

	const invoiceCreditProductsPromise = timeCatalogPhase({
		ctx,
		phases,
		phase: "invoice_credit_products",
		run: () => setupInvoiceCreditProducts({ ctx, params }),
	});
	const [featureStatesContext, productStatesContext, featureUsagePersisted] =
		await Promise.all([
			timeCatalogPhase({
				ctx,
				phases,
				phase: "feature_states",
				run: () => setupFeatureStatesContext({ ctx, params }),
			}),
			setupProductStatesContext({ ctx, params, phases, internalIdRefs }),
			preview
				? timeCatalogPhase({
						ctx,
						phases,
						phase: "feature_usage",
						run: () => setupFeatureUsagePersisted({ ctx, params }),
					})
				: undefined,
		]);
	const invoiceCreditProducts = await invoiceCreditProductsPromise;

	// License refs + plan-usage samples both need loaded product internal ids.
	const [licenseStatesContext, planUsagePersisted] = await Promise.all([
		timeCatalogPhase({
			ctx,
			phases,
			phase: "license_states",
			run: () => setupLicenseStatesContext({ ctx, productStatesContext }),
		}),
		preview
			? timeCatalogPhase({
					ctx,
					phases,
					phase: "plan_usage",
					run: () =>
						setupPlanUsagePersisted({ ctx, params, productStatesContext }),
				})
			: undefined,
	]);

	return {
		featureStatesContext,
		productStatesContext,
		internalIdRefs,
		invoiceCreditProducts,
		licenseStatesContext,
		previewContext: preview
			? {
					featureUsagePersisted: featureUsagePersisted ?? {},
					planUsagePersisted: planUsagePersisted ?? {},
				}
			: undefined,
	};
};
