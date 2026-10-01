import {
	type BalanceAllocations,
	customers,
	cusEntsToBalance,
	fullSubjectToCustomerEntitlements,
	solveAllocationScale,
} from "@autumn/shared";
import { and, eq, or } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/getFullSubject.js";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook.js";
import {
	allocationCounterUsage,
	allocationCycleOf,
	sharedRowsOf,
} from "../utils/allocationRows.js";

export const ALLOCATIONS_ADJUSTED_TAG = "allocations_adjusted";

const loadStoredAllocations = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<BalanceAllocations | null> => {
	const [row] = await ctx.db
		.select({ balanceAllocations: customers.balance_allocations })
		.from(customers)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				or(eq(customers.id, customerId), eq(customers.internal_id, customerId)),
			),
		)
		.limit(1);
	const allocations = row?.balanceAllocations;
	return allocations && Object.keys(allocations).length > 0 ? allocations : null;
};

/** Re-solves each allocated feature's scale against the shared credits left now; writes and notifies only on change. */
export const refreshAllocationScale = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<boolean> => {
	const stored = await loadStoredAllocations({ ctx, customerId });
	if (!stored) return false;

	await invalidateCachedFullSubject({
		ctx,
		customerId,
		source: "refreshAllocationScale",
		flushBalances: true,
	});
	const fullSubject = await getFullSubject({
		ctx,
		customerId,
		readFrom: "primary",
	});
	if (!fullSubject) return false;

	const customerEntitlements = fullSubjectToCustomerEntitlements({ fullSubject });
	const now = Date.now();
	const next: BalanceAllocations = { ...stored };
	let changed = false;
	for (const [internalFeatureId, allocation] of Object.entries(stored)) {
		const sharedRows = sharedRowsOf({
			customerEntitlements,
			featureId: allocation.feature_id,
			interval: allocation.interval,
		});
		const cycle = allocationCycleOf({
			sharedRows,
			interval: allocation.interval,
			now,
		});
		const usage = cycle
			? allocationCounterUsage({ fullSubject, allocation, cycle })
			: {};
		const scale = solveAllocationScale({
			sharedRemaining: cusEntsToBalance({ cusEnts: sharedRows }),
			entries: Object.entries(allocation.amounts).map(([id, requested]) => ({
				requested,
				usage: usage[id] ?? 0,
			})),
		});
		const cycleEnd = cycle?.windowEndAt ?? null;
		if (scale === allocation.scale && cycleEnd === (allocation.scale_cycle_end ?? null))
			continue;
		next[internalFeatureId] = { ...allocation, scale, scale_cycle_end: cycleEnd };
		changed = true;
	}
	if (!changed) return false;

	const { customer } = fullSubject;
	const originalFullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	const autumnBillingPlan = {
		customerId: customer.id ?? customer.internal_id,
		insertCustomerProducts: [],
		updateCustomer: { customer, updates: { balance_allocations: next } },
	};
	const { executeAutumnBillingPlan } = await import(
		"@/internal/billing/v2/execute/executeAutumnBillingPlan/executeAutumnBillingPlan.js"
	);
	await executeAutumnBillingPlan({ ctx, autumnBillingPlan });
	await invalidateCachedFullSubject({
		ctx,
		customerId,
		source: "refreshAllocationScale",
	});
	void sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan,
		originalFullCustomer,
		tags: [ALLOCATIONS_ADJUSTED_TAG],
	});
	return true;
};

/** A plan that only rewrites allocations never moves shared credits, so it needs no refresh. */
export const planOnlyUpdatesAllocations = ({
	autumnBillingPlan,
}: {
	autumnBillingPlan: {
		updateCustomer?: { updates: object };
		insertCustomerProducts?: unknown[];
	} & Record<string, unknown>;
}) => {
	const { updateCustomer, insertCustomerProducts, customerId, ...rest } =
		autumnBillingPlan;
	const updatedKeys = Object.keys(updateCustomer?.updates ?? {});
	const otherWork = Object.values(rest).some((value) =>
		Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null,
	);
	return (
		updatedKeys.length === 1 &&
		updatedKeys[0] === "balance_allocations" &&
		(insertCustomerProducts?.length ?? 0) === 0 &&
		!otherWork &&
		customerId !== undefined
	);
};
