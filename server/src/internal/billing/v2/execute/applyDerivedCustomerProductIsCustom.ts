import type {
	AutumnBillingPlan,
	FullCusProduct,
	FullProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	getPatchCustomerProducts,
	getUpdateCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { applyCustomerProductItemsPatch } from "@/internal/billing/v2/utils/initFullCustomerProduct/initPatchedCustomerProduct";
import { ProductService } from "@/internal/products/ProductService";
import { deriveCustomerProductIsCustom } from "./deriveCustomerProductIsCustom";

/** A customer product to derive for, and where the result has to land. */
type DerivationTarget = {
	/** The state to compare — for a patch, the reconstructed post-patch product. */
	customerProduct: FullCusProduct;
	/** The row the flag belongs to, which for a patch is the pre-patch object. */
	target: FullCusProduct;
	/** Inserts carry the flag on the row itself; patches persist it through the
	 * plan's update entry for the same row. */
	via: "insert" | "update";
};

/**
 * A patch entry carries the PRE-patch customer product, with the changes in its
 * insert/delete arrays, so the post-patch item set has to be reconstructed
 * before diffing.
 *
 * Known gap: one-off prepaid carry-overs land on the patched row via the plan's
 * own `insertCustomerEntitlements`, in DB-insert shape with no hydrated
 * entitlement, so they are not reconstructed here. A patch that carries credits
 * can read non-custom now and custom on the next write. The drift is towards
 * custom — the safe direction — and it self-corrects the next time the row is
 * touched.
 */
const collectDerivationTargets = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: AutumnBillingPlan;
}): DerivationTarget[] => [
	...(autumnBillingPlan.insertCustomerProducts ?? []).map(
		(customerProduct): DerivationTarget => ({
			customerProduct,
			target: customerProduct,
			via: "insert",
		}),
	),
	...getPatchCustomerProducts({ autumnBillingPlan }).map(
		(patch): DerivationTarget => ({
			customerProduct: applyCustomerProductItemsPatch({
				customerProduct: patch.customerProduct,
				insertCustomerPrices: patch.insertCustomerPrices,
				insertCustomerEntitlements: patch.insertCustomerEntitlements,
				deleteCustomerPrices: patch.deleteCustomerPrices,
				deleteCustomerEntitlements: patch.deleteCustomerEntitlements,
			}),
			target: patch.customerProduct,
			via: "update",
		}),
	),
];

/** Every distinct catalog version the plan touches, fetched in one pass so the
 * derivation itself runs with no further IO. An unresolved product resolves to
 * null, which the derivation reads as custom — the safe direction — rather than
 * failing the billing write. */
const loadBaseProducts = async ({
	ctx,
	targets,
}: {
	ctx: AutumnContext;
	targets: DerivationTarget[];
}): Promise<Map<string, FullProduct | null>> => {
	const internalProductIds = [
		...new Set(
			targets.flatMap(({ customerProduct }) =>
				customerProduct.internal_product_id
					? [customerProduct.internal_product_id]
					: [],
			),
		),
	];

	const loaded = await Promise.all(
		internalProductIds.map(async (internalProductId) => {
			try {
				const product = await ProductService.getFull({
					db: ctx.db,
					idOrInternalId: internalProductId,
					orgId: ctx.org.id,
					env: ctx.env,
					allowNotFound: true,
				});
				return [internalProductId, product] as const;
			} catch (error) {
				ctx.logger.warn(
					`[isCustom] could not load base product ${internalProductId}`,
					{ error },
				);
				return [internalProductId, null] as const;
			}
		}),
	);

	return new Map(loaded);
};

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
	const targets = collectDerivationTargets({ autumnBillingPlan });
	if (targets.length === 0) return;

	const baseProducts = await loadBaseProducts({ ctx, targets });

	// Every load is done, so the rest is pure — no IO inside the loop.
	const updateEntries = getUpdateCustomerProducts({ autumnBillingPlan });

	for (const { customerProduct, target, via } of targets) {
		const isCustom = deriveCustomerProductIsCustom({
			customerProduct,
			baseProduct: customerProduct.internal_product_id
				? baseProducts.get(customerProduct.internal_product_id)
				: null,
			features: ctx.features,
		});

		if (via === "insert") {
			target.is_custom = isCustom;
			continue;
		}

		if (isCustom === target.is_custom) continue;

		const updateEntry = updateEntries.find(
			(entry) => entry.customerProduct.id === target.id,
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
			{ customerProduct: target, updates: { is_custom: isCustom } },
		];
	}
};
