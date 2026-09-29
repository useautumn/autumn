import type {
	AutumnBillingPlan,
	Replaceable,
	UpdateCustomerEntitlement,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { AllocatedInvoiceContext } from "@/internal/balances/utils/allocatedInvoice/allocatedInvoiceContext.js";
import { computeAllocatedInvoicePlan } from "@/internal/balances/utils/allocatedInvoice/compute/computeAllocatedInvoicePlan.js";
import type { CreateEntitiesContext } from "../types/createEntitiesContext.js";

/** Reused replaceables give their seat back (+1 each) and hand their parked per-entity balance to a new entity. */
const applyReusedReplaceables = ({
	update,
	invoiced,
	reused,
	reusedBy,
}: {
	update: UpdateCustomerEntitlement;
	invoiced: UpdateCustomerEntitlement;
	reused: Replaceable[];
	reusedBy: Map<string, string>;
}): UpdateCustomerEntitlement => {
	if (update.customerEntitlement.id === invoiced.customerEntitlement.id) {
		return {
			...update,
			balanceChange: (update.balanceChange ?? 0) + reused.length,
			deletedReplaceables: reused,
		};
	}

	const parked = reused.filter(
		(replaceable) => update.customerEntitlement.entities?.[replaceable.id],
	);
	if (parked.length === 0) return update;

	const moveEntityBalances = Object.fromEntries(
		parked.map((replaceable) => [
			replaceable.id,
			reusedBy.get(replaceable.id) as string,
		]),
	);
	const entityBalanceChanges = Object.fromEntries(
		Object.entries(update.entityBalanceChanges ?? {}).filter(
			([entityId]) => !Object.values(moveEntityBalances).includes(entityId),
		),
	);
	return { ...update, moveEntityBalances, entityBalanceChanges };
};

/** Folds the allocated invoice's decisions (replaceable reuse, line items) into the create plan. */
export const mergeAllocatedInvoicePlan = ({
	ctx,
	context,
	autumnBillingPlan,
	billingContext,
}: {
	ctx: AutumnContext;
	context: CreateEntitiesContext;
	autumnBillingPlan: AutumnBillingPlan;
	billingContext: AllocatedInvoiceContext;
}): AutumnBillingPlan => {
	const invoicePlan = computeAllocatedInvoicePlan({ ctx, billingContext });
	const invoiced = invoicePlan?.updateCustomerEntitlements?.[0];
	if (!invoicePlan || !invoiced) return autumnBillingPlan;

	const reused = (invoiced.deletedReplaceables ?? []).map((replaceable) => ({
		...replaceable,
		from_entity_id: replaceable.from_entity_id ?? null,
	}));

	const inserted =
		context.entitiesByFeature.find(
			({ feature }) =>
				feature.internal_id ===
				invoiced.customerEntitlement.entitlement.feature.internal_id,
		)?.inserted ?? [];

	const reusedBy = new Map(
		reused.flatMap((replaceable, index) => {
			const entityId = inserted[index]?.id;
			return entityId ? [[replaceable.id, entityId] as const] : [];
		}),
	);

	return {
		...autumnBillingPlan,
		lineItems: invoicePlan.lineItems,
		updateCustomerEntitlements: (
			autumnBillingPlan.updateCustomerEntitlements ?? []
		).map((update) =>
			applyReusedReplaceables({ update, invoiced, reused, reusedBy }),
		),
	};
};
