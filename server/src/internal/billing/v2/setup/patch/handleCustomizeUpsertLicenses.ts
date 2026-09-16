import type {
	CustomerLicenseQuantity,
	FullCusProduct,
	FullCustomerLicense,
	FullProduct,
	InsertPlanLicenseSpec,
	PatchContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupUpdateLicenseQuantities } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateLicenseQuantities";
import { setupCustomizeLicenses } from "@/internal/billing/v2/setup/setupCustomizeLicenses";
import { convergeCustomerLicense } from "@/internal/billing/v2/utils/convergeCustomerLicense";
import { initCustomerLicenses } from "@/internal/billing/v2/utils/initFullCustomerProduct/initCustomerLicenses/initCustomerLicenses";

/**
 * Patch-path licenses handler — the upsert_licenses sibling of the
 * add/remove-items handlers. Resolves definitions through the shared core
 * (setupCustomizeLicenses), overlays them onto the patch snapshot, and
 * converges the working copy's pools onto them. The original row stays
 * pristine, so computeCustomerLicenseTransitions reads the change as a
 * SAME-ROW transition: outgoing = original, incoming = patched clone.
 * Links with no pool yet mint one, recorded on the patch for insertion.
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

	patchContext.insertCustomerLicenses = convergePatchedCustomerLicenses({
		targetCustomerProduct: patchContext.finalCustomerProduct,
		fullProduct,
		customerLicenseQuantities,
	});

	return { insertPlanLicenses, customerLicenseQuantities };
};

/** Walks the effective links: an existing pool converges in place (its
 * link_id anchors assigned seats), a link without one mints a fresh pool.
 * Returns the minted pools. */
const convergePatchedCustomerLicenses = ({
	targetCustomerProduct,
	fullProduct,
	customerLicenseQuantities,
}: {
	targetCustomerProduct: FullCusProduct;
	fullProduct: FullProduct;
	customerLicenseQuantities: CustomerLicenseQuantity[];
}): FullCustomerLicense[] => {
	const existingPools = targetCustomerProduct.customer_licenses ?? [];
	const mintedPools: FullCustomerLicense[] = [];

	const convergedPools = (fullProduct.licenses ?? []).flatMap((planLicense) => {
		const licensePlanId = planLicense.product.id;
		const existingPool = existingPools.find(
			(customerLicense) =>
				customerLicense.planLicense?.product.id === licensePlanId,
		);
		const totalQuantity = customerLicenseQuantities.find(
			(quantity) => quantity.licensePlanId === licensePlanId,
		)?.totalQuantity;

		if (!existingPool) {
			const minted = initCustomerLicenses({
				customerProduct: targetCustomerProduct,
				fullProduct: { ...fullProduct, licenses: [planLicense] },
				customerLicenseQuantities,
			});
			mintedPools.push(...minted);
			return minted;
		}

		const paidQuantity =
			totalQuantity === undefined
				? existingPool.paid_quantity
				: Math.max(0, totalQuantity - planLicense.included);
		return [
			convergeCustomerLicense({
				customerLicense: existingPool,
				planLicense,
				paidQuantity,
			}),
		];
	});

	// Pools whose link the customize dropped pass through untouched.
	const convergedIds = new Set(convergedPools.map((pool) => pool.id));
	targetCustomerProduct.customer_licenses = [
		...existingPools.filter((pool) => !convergedIds.has(pool.id)),
		...convergedPools,
	];

	return mintedPools;
};
