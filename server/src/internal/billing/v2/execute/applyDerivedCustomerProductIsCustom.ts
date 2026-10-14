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
import { deriveCustomerProductIsCustom } from "@/internal/customers/cusProducts/actions/deriveIsCustom/deriveCustomerProductIsCustom";
import { loadBaseProduct } from "@/internal/customers/cusProducts/actions/deriveIsCustom/loadBaseProduct";

type DerivationTarget = {
	customerProduct: FullCusProduct;
	target: FullCusProduct;
	via: "insert" | "update";
};

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
		internalProductIds.map(
			async (internalProductId) =>
				[
					internalProductId,
					await loadBaseProduct({ ctx, internalProductId }),
				] as const,
		),
	);

	return new Map(loaded);
};

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

	const updateEntries = getUpdateCustomerProducts({ autumnBillingPlan });

	for (const { customerProduct, target, via } of targets) {
		const { isCustom } = deriveCustomerProductIsCustom({
			ctx,
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

		const updateEntry = updateEntries.find(
			(entry) => entry.customerProduct.id === target.id,
		);

		if (updateEntry) {
			updateEntry.updates.is_custom = isCustom;
			continue;
		}

		if (isCustom === target.is_custom) continue;

		autumnBillingPlan.updateCustomerProducts = [
			...(autumnBillingPlan.updateCustomerProducts ?? []),
			{ customerProduct: target, updates: { is_custom: isCustom } },
		];
	}
};
