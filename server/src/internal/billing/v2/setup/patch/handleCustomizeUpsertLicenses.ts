import type {
	CustomerLicenseQuantity,
	FullCusProduct,
	FullProduct,
	InsertPlanLicenseSpec,
	PatchContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupUpdateLicenseQuantities } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateLicenseQuantities";
import { setupCustomizeLicenses } from "@/internal/billing/v2/setup/setupCustomizeLicenses";
import { convergeCustomerLicense } from "@/internal/billing/v2/utils/convergeCustomerLicense";

/**
 * Patch-path licenses handler — the upsert_licenses sibling of the
 * add/remove-items handlers. Resolves definitions through the shared core
 * (setupCustomizeLicenses), overlays them onto the patch snapshot, and
 * converges the working copy's pools onto them. The original row stays
 * pristine, so computeCustomerLicenseTransitions reads the change as a
 * SAME-ROW transition: outgoing = original, incoming = patched clone.
 */
export const handleCustomizeUpsertLicenses = async ({
	ctx,
	params,
	patchContext,
	customerProduct,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	patchContext: PatchContext;
	customerProduct: FullCusProduct;
}): Promise<{
	insertPlanLicenses?: InsertPlanLicenseSpec[];
	customerLicenseQuantities: CustomerLicenseQuantity[];
}> => {
	const { fullProduct, insertPlanLicenses } = await setupCustomizeLicenses({
		ctx,
		customize: params.customize,
		productContext: {
			fullProduct: patchContext.fullProduct,
			customPrices: [],
			customEnts: [],
		},
	});
	patchContext.fullProduct = fullProduct;

	const customerLicenseQuantities = setupUpdateLicenseQuantities({
		params,
		fullProduct,
		customerProduct,
	});

	convergePatchedCustomerLicenses({
		targetCustomerProduct: patchContext.finalCustomerProduct,
		fullProduct,
		customerLicenseQuantities,
	});

	return { insertPlanLicenses, customerLicenseQuantities };
};

/** Mutates the working copy's pools onto the effective definitions and
 * requested paid counts; untouched pools pass through unchanged. */
const convergePatchedCustomerLicenses = ({
	targetCustomerProduct,
	fullProduct,
	customerLicenseQuantities,
}: {
	targetCustomerProduct: FullCusProduct;
	fullProduct: FullProduct;
	customerLicenseQuantities: CustomerLicenseQuantity[];
}) => {
	targetCustomerProduct.customer_licenses =
		targetCustomerProduct.customer_licenses?.map((customerLicense) => {
			const licensePlanId = customerLicense.planLicense?.product.id;
			const planLicense = fullProduct.licenses?.find(
				(link) => link.product.id === licensePlanId,
			);
			if (!planLicense) return customerLicense;

			const totalQuantity = customerLicenseQuantities.find(
				(quantity) => quantity.licensePlanId === licensePlanId,
			)?.totalQuantity;
			const paidQuantity =
				totalQuantity === undefined
					? customerLicense.paid_quantity
					: Math.max(0, totalQuantity - planLicense.included);

			return convergeCustomerLicense({
				customerLicense,
				planLicense,
				paidQuantity,
			});
		});
};
