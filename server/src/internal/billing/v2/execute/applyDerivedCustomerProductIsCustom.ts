import type {
	AutumnBillingPlan,
	FullCusProduct,
	FullProduct,
} from "@autumn/shared";
import { deriveCustomerProductIsCustom } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	getPatchCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { applyCustomerProductItemsPatch } from "@/internal/billing/v2/utils/initFullCustomerProduct/initPatchedCustomerProduct";
import { ProductService } from "@/internal/products/ProductService";

/**
 * Stamps the derived `is_custom` onto every customer product this plan creates
 * or whose items it rewrites.
 *
 * Runs here rather than in each action's compute step because every v2 write
 * funnels through the billing plan: one hook covers attach, update, schedules,
 * sync, restore, imports and the lifecycle actions alike, and no caller can
 * reintroduce a hand-picked value.
 *
 * Plain update entries are left alone — they only move status, dates and
 * subscription ids, so the customer's item set (and therefore the flag) is
 * unchanged.
 */
export const applyDerivedCustomerProductIsCustom = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const baseProductByInternalId = new Map<string, FullProduct | null>();

	const loadBaseProduct = async (internalProductId?: string | null) => {
		if (!internalProductId) return null;
		const cached = baseProductByInternalId.get(internalProductId);
		if (cached !== undefined) return cached;

		let baseProduct: FullProduct | null = null;
		try {
			// Resolves the exact version the row points at, and the underlying
			// query already excludes custom prices/entitlements — so this is the
			// clean catalog definition to compare against.
			baseProduct = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: internalProductId,
				orgId: ctx.org.id,
				env: ctx.env,
				allowNotFound: true,
			});
		} catch (error) {
			// Never fail a billing write over the flag; an unresolved base makes
			// the derivation fall back to `custom`, which is the safe direction.
			ctx.logger.warn(
				`[isCustom] could not load base product ${internalProductId}`,
				{ error },
			);
		}

		baseProductByInternalId.set(internalProductId, baseProduct);
		return baseProduct;
	};

	const derive = async (customerProduct: FullCusProduct) =>
		deriveCustomerProductIsCustom({
			customerProduct,
			baseProduct: await loadBaseProduct(customerProduct.internal_product_id),
			features: ctx.features,
		});

	// New rows are inserted wholesale, so stamping the object is enough.
	for (const customerProduct of autumnBillingPlan.insertCustomerProducts ??
		[]) {
		customerProduct.is_custom = await derive(customerProduct);
	}

	// A patch entry carries the PRE-patch customer product, with the changes in
	// its insert/delete arrays — so the post-patch item set has to be
	// reconstructed before comparing. Patch execution only writes
	// customer_prices / customer_entitlements, so the column itself is persisted
	// through the plan's update entry for the same row.
	//
	// Known gap: one-off prepaid carry-overs land on the patched row via the
	// plan's own `insertCustomerEntitlements`, in DB-insert shape with no
	// hydrated entitlement, so they are not reconstructed here. A patch that
	// carries credits can therefore read non-custom now and custom on the next
	// update that re-derives. The drift is towards custom — the safe direction —
	// and it self-corrects the next time the row is touched.
	const updateEntries = getUpdateCustomerProducts({ autumnBillingPlan });

	for (const patch of getPatchCustomerProducts({ autumnBillingPlan })) {
		const { customerProduct } = patch;
		const isCustom = await derive(
			applyCustomerProductItemsPatch({
				customerProduct,
				insertCustomerPrices: patch.insertCustomerPrices,
				insertCustomerEntitlements: patch.insertCustomerEntitlements,
				deleteCustomerPrices: patch.deleteCustomerPrices,
				deleteCustomerEntitlements: patch.deleteCustomerEntitlements,
			}),
		);

		if (isCustom === customerProduct.is_custom) continue;

		const updateEntry = updateEntries.find(
			(entry) => entry.customerProduct.id === customerProduct.id,
		);

		if (updateEntry) {
			updateEntry.updates.is_custom = isCustom;
			continue;
		}

		// The patch plan always registers an update entry for the patched row, so
		// this is a guard against a future caller that doesn't — without it the
		// derived value would be silently dropped.
		autumnBillingPlan.updateCustomerProducts = [
			...(autumnBillingPlan.updateCustomerProducts ?? []),
			{ customerProduct, updates: { is_custom: isCustom } },
		];
	}
};
