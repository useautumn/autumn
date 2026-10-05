import {
	type AutumnBillingPlan,
	addSafe,
	type CustomerProductUpdate,
	type FullCustomerEntitlement,
	InternalError,
	type PooledBalancePlan,
	type UpdateCustomerEntitlement,
} from "@autumn/shared";
import { mergePooledBalancePlans } from "../billingPlan/mergePooledBalancePlans";
import { pooledBalancePlanHasChanges } from "../billingPlan/pooledBalancePlan";

/** Later columns win and deltas add up; build splits compatible replacements and deltas for the executors. */
const mergeCustomerEntitlementUpdates = ({
	base,
	incoming,
}: {
	base: UpdateCustomerEntitlement;
	incoming: UpdateCustomerEntitlement;
}): UpdateCustomerEntitlement => {
	const updates =
		base.updates || incoming.updates
			? { ...base.updates, ...incoming.updates }
			: undefined;
	const balanceChange = addSafe({
		left: base.balanceChange ?? 0,
		right: incoming.balanceChange ?? 0,
	});
	const entityBalanceChanges = { ...base.entityBalanceChanges };
	for (const [entityId, delta] of Object.entries(
		incoming.entityBalanceChanges ?? {},
	))
		entityBalanceChanges[entityId] = addSafe({
			left: entityBalanceChanges[entityId] ?? 0,
			right: delta,
		});
	const moveEntityBalances = {
		...base.moveEntityBalances,
		...incoming.moveEntityBalances,
	};
	const hasConflictingBalanceChange =
		(balanceChange !== 0 && updates?.balance !== undefined) ||
		Object.keys(entityBalanceChanges).some((entityId) => {
			const entry = updates?.entities?.[entityId];
			return (
				entry !== undefined &&
				entry.balance !== base.customerEntitlement.entities?.[entityId]?.balance
			);
		}) ||
		Object.keys(moveEntityBalances).length > 0;
	if (updates && hasConflictingBalanceChange)
		throw new InternalError({
			message: `Billing plan sets columns and moves the balance of the same grant ${base.customerEntitlement.id}`,
		});
	return {
		customerEntitlement: incoming.customerEntitlement,
		...(updates ? { updates } : {}),
		...(balanceChange !== 0 ? { balanceChange } : {}),
		...(Object.keys(entityBalanceChanges).length > 0
			? { entityBalanceChanges }
			: {}),
		...(Object.keys(moveEntityBalances).length > 0
			? { moveEntityBalances }
			: {}),
		insertRollovers: [
			...(base.insertRollovers ?? []),
			...(incoming.insertRollovers ?? []),
		],
		deletedReplaceables: [
			...(base.deletedReplaceables ?? []),
			...(incoming.deletedReplaceables ?? []),
		],
	};
};

export type AutumnBillingPlanBuilder = ReturnType<
	typeof createAutumnBillingPlanBuilder
>;

/**
 * Gathers a handler's writes into one AutumnBillingPlan so they land as one step (one worker mutation
 * on the rollout) instead of one statement per task. Tasks stay pure: they read the snapshot, or a
 * row as the plan so far leaves it, and append.
 */
export const createAutumnBillingPlanBuilder = ({
	customerId,
}: {
	customerId: string;
}) => {
	const customerProductUpdates = new Map<string, CustomerProductUpdate>();
	const customerEntitlementUpdates = new Map<
		string,
		UpdateCustomerEntitlement
	>();
	let pooledBalancePlan: PooledBalancePlan | undefined;

	const build = (): AutumnBillingPlan => ({
		customerId,
		insertCustomerProducts: [],
		updateCustomerProducts: [...customerProductUpdates.values()],
		updateCustomerEntitlements: [
			...customerEntitlementUpdates.values(),
		].flatMap((update) => {
			if (
				!update.updates ||
				(!update.balanceChange &&
					Object.keys(update.entityBalanceChanges ?? {}).length === 0)
			)
				return [update];

			const { updates, ...balanceUpdate } = update;
			return [
				{ customerEntitlement: update.customerEntitlement, updates },
				{
					...balanceUpdate,
					...(updates.entities !== undefined && update.entityBalanceChanges
						? {
								entityBalanceChanges: Object.fromEntries(
									Object.entries(update.entityBalanceChanges).filter(
										([entityId]) =>
											Object.hasOwn(updates.entities ?? {}, entityId),
									),
								),
							}
						: {}),
				},
			];
		}),
		pooledBalancePlan,
	});

	return {
		updateCustomerProduct: ({
			customerProduct,
			updates,
		}: CustomerProductUpdate) => {
			const existing = customerProductUpdates.get(customerProduct.id);
			customerProductUpdates.set(customerProduct.id, {
				customerProduct,
				updates: { ...existing?.updates, ...updates },
			});
		},

		updateCustomerEntitlement: (incoming: UpdateCustomerEntitlement) => {
			const { id } = incoming.customerEntitlement;
			const base = customerEntitlementUpdates.get(id);
			customerEntitlementUpdates.set(
				id,
				base ? mergeCustomerEntitlementUpdates({ base, incoming }) : incoming,
			);
		},

		/** Planned column replacements before deltas, for a task that refines an earlier replacement. */
		projectedCustomerEntitlement: <T extends FullCustomerEntitlement>(
			customerEntitlement: T,
		): T => ({
			...customerEntitlement,
			...customerEntitlementUpdates.get(customerEntitlement.id)?.updates,
		}),

		addPooledBalancePlan: (incoming: PooledBalancePlan) => {
			pooledBalancePlan = mergePooledBalancePlans({
				base: pooledBalancePlan,
				incoming,
			});
		},

		hasChanges: (): boolean =>
			customerProductUpdates.size > 0 ||
			customerEntitlementUpdates.size > 0 ||
			pooledBalancePlanHasChanges({ pooledBalancePlan }),

		build,
	};
};
