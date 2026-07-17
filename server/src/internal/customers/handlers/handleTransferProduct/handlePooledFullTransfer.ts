import {
	type Entity,
	type FullCusProduct,
	type FullCustomer,
	InternalError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executePooledBalanceOps } from "@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js";
import { CusEntService } from "../../cusProducts/cusEnts/CusEntitlementService.js";
import { computePooledFullTransferPlan } from "./computePooledTransferPlan.js";
import {
	getTransferCustomerProducts,
	transferRelatedCustomerProducts,
} from "./transferRelatedCustomerProducts.js";

export type HandlePooledFullTransferDependencies = {
	executePooledBalanceOps: typeof executePooledBalanceOps;
	transferRelatedCustomerProducts: typeof transferRelatedCustomerProducts;
	updateCustomerEntitlement: typeof CusEntService.update;
};

const defaultHandlePooledFullTransferDependencies: HandlePooledFullTransferDependencies =
	{
		executePooledBalanceOps,
		transferRelatedCustomerProducts,
		updateCustomerEntitlement: CusEntService.update,
	};

type TransferProduct = {
	id: string;
	group: string | null;
	is_add_on: boolean;
};

type TransferEntityUpdates = {
	entity_id: string | null;
	internal_entity_id: string | null;
};

export const handlePooledFullTransfer = async ({
	ctx,
	fullCustomer,
	fromEntity,
	toEntity,
	product,
	customerProduct,
	customerProductId,
	dependencies = defaultHandlePooledFullTransferDependencies,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	fromEntity: Entity | null;
	toEntity: Entity | null;
	product: TransferProduct;
	customerProduct: FullCusProduct;
	customerProductId?: string | null;
	dependencies?: HandlePooledFullTransferDependencies;
}): Promise<TransferEntityUpdates> => {
	const relatedCustomerProducts = getTransferCustomerProducts({
		fullCustomer,
		fromEntity,
		product,
		customerProductId,
	});
	const transferCustomerProducts =
		relatedCustomerProducts.length > 0
			? relatedCustomerProducts
			: [customerProduct];
	const now = Date.now();
	const plans = transferCustomerProducts.map((transferCustomerProduct) =>
		computePooledFullTransferPlan({
			fullCustomer,
			customerProduct: transferCustomerProduct,
			toEntity,
			now,
		}),
	);
	const pooledBalanceOps = plans.flatMap((plan) => plan.pooledBalanceOps);

	let updates: TransferEntityUpdates = {
		entity_id: toEntity?.id ?? null,
		internal_entity_id: toEntity?.internal_id ?? null,
	};
	const customerId = fullCustomer.id ?? fullCustomer.internal_id;
	if (!customerId) {
		throw new InternalError({
			message: "Cannot transfer a pooled product without a customer ID.",
		});
	}
	await dependencies.executePooledBalanceOps({
		ctx,
		customerId,
		pooledBalanceOps,
		beforeRebalance: async ({ db }) => {
			const transactionContext = { ...ctx, db };
			updates = await dependencies.transferRelatedCustomerProducts({
				ctx: transactionContext,
				fullCustomer,
				fromEntity,
				toEntity,
				product,
				customerProductId,
			});

			for (const plan of plans) {
				for (const customerEntitlement of plan.updatedCustomerProduct
					.customer_entitlements) {
					if (customerEntitlement.entitlement.pooled !== true) continue;
					await dependencies.updateCustomerEntitlement({
						ctx: transactionContext,
						id: customerEntitlement.id,
						updates: {
							balance: customerEntitlement.balance ?? 0,
							adjustment: customerEntitlement.adjustment,
							additional_balance: customerEntitlement.additional_balance,
							entities: customerEntitlement.entities,
							reset_cycle_anchor: customerEntitlement.reset_cycle_anchor,
							next_reset_at: customerEntitlement.next_reset_at,
						},
						incrementCacheVersion: true,
					});
				}
			}
		},
		afterRebalance: async ({ db }) => {
			const transactionContext = { ...ctx, db };
			for (const plan of plans) {
				for (const restoration of plan.restoreOrdinaryCustomerEntitlements) {
					await dependencies.updateCustomerEntitlement({
						ctx: transactionContext,
						id: restoration.customerEntitlementId,
						updates: {
							balance: restoration.balance,
							adjustment: restoration.adjustment,
							additional_balance: restoration.additionalBalance,
							entities: null,
						},
						incrementCacheVersion: true,
					});
				}
			}
		},
	});

	return updates;
};
