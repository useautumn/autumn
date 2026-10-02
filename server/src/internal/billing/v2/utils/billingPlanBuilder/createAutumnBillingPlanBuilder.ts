import { appendFileSync } from "node:fs";
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

/** Two updates to one grant: later columns win, deltas add up, rows accumulate. A delta and a column set on the same grant is a bug: the executor applies one or the other. */
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
	const movesBalance =
		balanceChange !== 0 ||
		Object.keys(entityBalanceChanges).length > 0 ||
		Object.keys(moveEntityBalances).length > 0;
	if (updates && movesBalance) {
		appendFileSync(
			"/tmp/pr3977-linked-lifetime-conflicts.jsonl",
			`${JSON.stringify({
				at: Date.now(),
				grantId: base.customerEntitlement.id,
				featureId: base.customerEntitlement.entitlement.feature_id,
				interval: base.customerEntitlement.entitlement.interval,
				entityFeatureId: base.customerEntitlement.entitlement.entity_feature_id,
				baseBalanceChange: base.balanceChange,
				incomingBalanceChange: incoming.balanceChange,
				baseColumns: Object.keys(base.updates ?? {}),
				incomingColumns: Object.keys(incoming.updates ?? {}),
				stack: new Error().stack,
			})}\n`,
		);
		throw new InternalError({
			message: `Billing plan sets columns and moves the balance of the same grant ${base.customerEntitlement.id}`,
		});
	}
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
		updateCustomerEntitlements: [...customerEntitlementUpdates.values()],
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

		/** The grant as the plan so far leaves it, for a task that builds on an earlier task's columns. */
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
