import type {
	EntityBalance,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import type { DeductionUpdates } from "@/internal/balances/utils/types/deductionUpdate";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem";
import { deductFromMainBalance } from "./deductFromMainBalance";

const applyUpdatesToCusEnt = ({
	cusEnt,
	newBalance,
	newEntities,
	newAdjustment,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	newBalance: number;
	newEntities: Record<string, EntityBalance> | null;
	newAdjustment: number;
}): FullCusEntWithFullCusProduct => {
	cusEnt.balance = newBalance;
	cusEnt.entities = newEntities;
	cusEnt.adjustment = newAdjustment;

	return cusEnt;
};

const buildMutationLogs = ({
	previousCusEnt,
	nextCusEnt,
}: {
	previousCusEnt: FullCusEntWithFullCusProduct;
	nextCusEnt: FullCusEntWithFullCusProduct;
}): MutationLogItem[] => {
	const mutationLogs: MutationLogItem[] = [];
	const previousEntities = previousCusEnt.entities ?? {};
	const nextEntities = nextCusEnt.entities ?? {};

	for (const entityId of new Set([
		...Object.keys(previousEntities),
		...Object.keys(nextEntities),
	])) {
		const previousEntity = previousEntities[entityId];
		const nextEntity = nextEntities[entityId];

		const balanceDelta =
			(nextEntity?.balance ?? 0) - (previousEntity?.balance ?? 0);
		const adjustmentDelta =
			(nextEntity?.adjustment ?? 0) - (previousEntity?.adjustment ?? 0);

		if (balanceDelta === 0 && adjustmentDelta === 0) continue;

		mutationLogs.push({
			target_type: "customer_entitlement",
			customer_entitlement_id: nextCusEnt.id,
			rollover_id: null,
			entity_id: entityId,
			credit_cost: 1,
			balance_delta: balanceDelta,
			adjustment_delta: adjustmentDelta,
			usage_delta: 0,
			value_delta: -balanceDelta,
		});
	}

	if (mutationLogs.length > 0) {
		return mutationLogs;
	}

	const balanceDelta =
		(nextCusEnt.balance ?? 0) - (previousCusEnt.balance ?? 0);
	const adjustmentDelta =
		(nextCusEnt.adjustment ?? 0) - (previousCusEnt.adjustment ?? 0);

	if (balanceDelta === 0 && adjustmentDelta === 0) {
		return mutationLogs;
	}

	return [
		{
			target_type: "customer_entitlement",
			customer_entitlement_id: nextCusEnt.id,
			rollover_id: null,
			entity_id: null,
			credit_cost: 1,
			balance_delta: balanceDelta,
			adjustment_delta: adjustmentDelta,
			usage_delta: 0,
			value_delta: -balanceDelta,
		},
	];
};

/**
 * Runs a single deduction pass over customer entitlements, tracking updates and mutation logs.
 * Extracted to avoid duplicating the per-cusEnt loop logic across passes.
 *
 * Also exported for reuse by callers that need the "paydown primitive" — e.g. the auto
 * top-up rebalancer uses a single pass with `maxBalance: 0` and a negative `amountToDeduct`
 * to heal overage'd cusEnts up to (but not past) zero.
 */
export const runDeductionPass = ({
	cusEnts,
	amountToDeduct,
	targetEntityId,
	allowOverage,
	minBalance,
	maxBalance,
	alterGrantedBalance,
	updates,
	mutationLogs,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	amountToDeduct: number;
	targetEntityId?: string;
	allowOverage?: boolean;
	minBalance?: number;
	maxBalance?: number;
	alterGrantedBalance?: boolean;
	updates: DeductionUpdates;
	mutationLogs: MutationLogItem[];
}): { amountToDeduct: number } => {
	for (const cusEnt of cusEnts) {
		if (amountToDeduct === 0) break;

		const previousCusEnt = structuredClone(cusEnt);

		const { deducted, newBalance, newEntities, newAdjustment, remaining } =
			deductFromMainBalance({
				cusEnt,
				amountToDeduct,
				targetEntityId,
				minBalance,
				maxBalance,
				alterGrantedBalance,
				allowOverage,
			});

		amountToDeduct = remaining;

		applyUpdatesToCusEnt({
			cusEnt,
			newBalance,
			newEntities,
			newAdjustment,
		});

		updates[cusEnt.id] = {
			balance: cusEnt.balance ?? 0,
			additional_balance: 0,
			entities: cusEnt.entities ?? {},
			adjustment: cusEnt.adjustment ?? 0,
			deducted: (updates[cusEnt.id]?.deducted ?? 0) + deducted,
		};

		mutationLogs.push(
			...buildMutationLogs({
				previousCusEnt,
				nextCusEnt: cusEnt,
			}),
		);
	}

	return { amountToDeduct };
};

export const deductFromCusEntsTypescript = ({
	cusEnts,
	amountToDeduct,
	targetEntityId,
	alterGrantedBalance,
	allowOverage,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	amountToDeduct: number;
	targetEntityId?: string;
	alterGrantedBalance?: boolean;
	allowOverage?: boolean;
}): {
	updates: DeductionUpdates;
	mutationLogs: MutationLogItem[];
	remaining: number;
} => {
	const updates: DeductionUpdates = {};
	const mutationLogs: MutationLogItem[] = [];
	const isRefund = amountToDeduct < 0;

	// Pass 1:
	//   Deductions: floor at 0 (deduct as much as possible without going negative)
	//   Refunds:    ceiling at 0 (only refund from negative up to 0)
	const pass1Result = runDeductionPass({
		cusEnts,
		amountToDeduct,
		targetEntityId,
		minBalance: isRefund ? undefined : 0,
		maxBalance: isRefund ? 0 : undefined,
		alterGrantedBalance,
		updates,
		mutationLogs,
	});
	amountToDeduct = pass1Result.amountToDeduct;

	if (amountToDeduct === 0) {
		return { updates, mutationLogs, remaining: amountToDeduct };
	}

	// Sort usage_allowed entitlements first so overage hits them before regular ones
	if (amountToDeduct > 0 && allowOverage) {
		cusEnts.sort((a, b) => {
			const leftUsageAllowed = a.usage_allowed ?? false;
			const rightUsageAllowed = b.usage_allowed ?? false;

			if (leftUsageAllowed === rightUsageAllowed) return 0;
			return leftUsageAllowed ? -1 : 1;
		});
	}

	// Pass 2:
	//   Deductions: floor at minBalance (can go below 0 if usage_allowed / allowOverage)
	//   Refunds:    ceiling at maxBalance (can go above 0 up to max, or uncapped if allowOverage)
	const pass2Result = runDeductionPass({
		cusEnts,
		amountToDeduct,
		targetEntityId,
		allowOverage,
		alterGrantedBalance,
		updates,
		mutationLogs,
	});
	amountToDeduct = pass2Result.amountToDeduct;

	return {
		updates,
		mutationLogs,
		remaining: amountToDeduct,
	};
};
