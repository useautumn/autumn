import {
	AttachParamsV1Schema,
	type CreatePlanItemParamsV1,
	type CustomizePlanV1,
	ErrCode,
	ExtUpdateSubscriptionV1ParamsSchema,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	type ProductV2,
	productV2ToApiPlanV1,
	RecaseError,
	toCreatePlanItemParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import { setupCustomFullProduct } from "@/internal/billing/v2/setup/setupCustomFullProduct.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { mapToProductV2 } from "@/internal/products/productV2Utils.js";
import { nullish } from "@/utils/genUtils.js";
import type { LicenseDefinition, LicenseTopology } from "../../licenseTypes.js";
import {
	findLicenseCarrier,
	isLicenseAssignableStatus,
} from "../../licenseUtils.js";
import { licenseAssignmentRepo } from "../../repos/licenseAssignmentRepo.js";
import { resolveEffectiveLicenseProduct } from "../customize/resolveEffectiveLicenseProduct.js";

type CarrierSyncContext = AutumnContext & {
	licenseCarrierSyncActive?: boolean;
};

/**
 * The carrier's customize: money only. Priced feature items become 0-allowance
 * catch-alls (per-assignment allowances stay on the unbilled assignment products and
 * deduction falls through here), and the base price is removed (price: null).
 */
const buildCarrierCustomize = ({
	ctx,
	effectiveProduct,
}: {
	ctx: AutumnContext;
	effectiveProduct: FullProduct;
}): {
	customize: CustomizePlanV1;
	hasPricedItems: boolean;
} => {
	const productV2 = mapToProductV2({
		product: effectiveProduct,
		features: ctx.features,
	});
	const effectiveItems = productToCreatePlanItems({ ctx, productV2 });
	const paygItems = effectiveItems
		.filter((item) => item.price)
		.map((item) => ({ ...item, included: 0 }));

	return {
		customize: {
			price: null,
			items: paygItems,
		},
		hasPricedItems: paygItems.length > 0,
	};
};

const attachCarrier = async ({
	ctx,
	fullCustomer,
	parent,
	licenseProduct,
	customize,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	parent: FullCusProduct;
	licenseProduct: FullProduct;
	customize: CustomizePlanV1;
}) => {
	const custom = await setupCustomFullProduct({
		ctx,
		currentFullProduct: licenseProduct,
		customizePlan: customize,
	});

	const customerId = fullCustomer.id ?? fullCustomer.internal_id;
	await billingActions.attach({
		ctx,
		params: AttachParamsV1Schema.parse({
			customer_id: customerId,
			plan_id: licenseProduct.id,
			redirect_mode: "if_required",
		}),
		contextOverride: {
			productContext: {
				// is_add_on so the carrier stacks alongside the parent plan instead
				// of transitioning it.
				fullProduct: { ...custom.fullProduct, is_add_on: true },
				customPrices: custom.customPrices,
				customEnts: custom.customEnts,
			},
		},
	});

	const carrier =
		await licenseAssignmentRepo.findLatestActiveCustomerLevelCustomerProduct({
			db: ctx.db,
			internalCustomerId: fullCustomer.internal_id,
			internalProductId: licenseProduct.internal_id,
		});
	if (!carrier) {
		throw new RecaseError({
			message: `License billing for ${licenseProduct.id} did not complete. Ensure the customer has a payment method on file.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	await CusProductService.update({
		ctx,
		cusProductId: carrier.id,
		updates: { license_parent_customer_product_id: parent.id },
	});
};

const cancelCarrier = async ({
	ctx,
	fullCustomer,
	carrier,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	carrier: FullCusProduct;
}) => {
	await billingActions.updateSubscription({
		ctx,
		params: ExtUpdateSubscriptionV1ParamsSchema.parse({
			customer_id: fullCustomer.id ?? fullCustomer.internal_id,
			subscription_id: carrier.id,
			cancel_action: "cancel_immediately",
		}),
	});
};

const syncCarrierForDefinition = async ({
	ctx,
	fullCustomer,
	parent,
	licenseDefinition,
	getLicenseProduct,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	parent: FullCusProduct;
	licenseDefinition: LicenseDefinition;
	getLicenseProduct: LicenseTopology["getLicenseProduct"];
}) => {
	const isTombstoned = licenseDefinition.included <= 0;

	const licenseProduct = await getLicenseProduct(
		licenseDefinition.license_internal_product_id,
	);
	const effectiveProduct = await resolveEffectiveLicenseProduct({
		ctx,
		licenseProduct,
		planLicenseId: licenseDefinition.id,
	});
	const { customize, hasPricedItems } = buildCarrierCustomize({
		ctx,
		effectiveProduct,
	});
	const carrierNeeded = !isTombstoned && hasPricedItems;

	const carrier = findLicenseCarrier({
		fullCustomer,
		parentCustomerProductId: parent.id,
		licenseInternalProductId: licenseDefinition.license_internal_product_id,
	});

	if (!carrierNeeded) {
		if (carrier) await cancelCarrier({ ctx, fullCustomer, carrier });
		return;
	}

	if (!carrier) {
		await attachCarrier({
			ctx,
			fullCustomer,
			parent,
			licenseProduct,
			customize,
		});
	}
};

/**
 * Converges every (parent, license) pair's billing carrier: one customer-level
 * attach of the license plan holding the payg catch-alls.
 * Idempotent; re-entrancy guarded because the carrier attach itself fires the
 * license billing lifecycle.
 */
export const syncLicenseCarriersForCustomer = async ({
	ctx,
	fullCustomer,
	topology,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	topology: LicenseTopology;
}) => {
	const syncCtx = ctx as CarrierSyncContext;
	if (syncCtx.licenseCarrierSyncActive) return;
	syncCtx.licenseCarrierSyncActive = true;
	try {
		const { validParents, definitionsByParentId, getLicenseProduct } = topology;

		for (const parent of validParents) {
			for (const licenseDefinition of definitionsByParentId.get(parent.id) ??
				[]) {
				await syncCarrierForDefinition({
					ctx,
					fullCustomer,
					parent,
					licenseDefinition,
					getLicenseProduct,
				});
			}
		}

		const validParentIds = new Set(validParents.map((parent) => parent.id));
		for (const customerProduct of fullCustomer.customer_products) {
			if (
				customerProduct.license_parent_customer_product_id &&
				nullish(customerProduct.internal_entity_id) &&
				isLicenseAssignableStatus({ status: customerProduct.status }) &&
				!validParentIds.has(customerProduct.license_parent_customer_product_id)
			) {
				await cancelCarrier({ ctx, fullCustomer, carrier: customerProduct });
			}
		}
	} finally {
		syncCtx.licenseCarrierSyncActive = false;
	}
};

/** Shared serialization pipeline: ProductV2 → API plan → create-item params. */
const productToCreatePlanItems = ({
	ctx,
	productV2,
}: {
	ctx: AutumnContext;
	productV2: ProductV2;
}): CreatePlanItemParamsV1[] =>
	productV2ToApiPlanV1({
		product: productV2,
		features: ctx.features,
		currency: ctx.org.default_currency ?? "USD",
	}).items.map(toCreatePlanItemParams);
