import type { AppEnv } from "@autumn/shared";
import { buildSharedFullSubjectBalanceKey } from "./buildSharedFullSubjectBalanceKey.js";

// Upstash key-based locking requires every key the Lua script touches to be
// declared via KEYS[]. Layout the deductFromSubjectBalances script expects:
//   KEYS[1]  = routing key
//   KEYS[2]  = lock receipt key ("" when no lock)
//   KEYS[3]  = idempotency key ("" when request is not idempotent)
//   KEYS[4+] = per-feature balance hash keys
const ROUTING_KEY_INDEX = 1;
const LOCK_RECEIPT_KEY_INDEX = 2;
const IDEMPOTENCY_KEY_INDEX = 3;
const BALANCE_KEYS_START_INDEX = 4;

export const buildDeductFromSubjectBalancesKeys = ({
	orgId,
	env,
	customerId,
	routingKey,
	lockReceiptKey,
	idempotencyKey,
	customerEntitlementDeductions,
	fallbackFeatureId,
}: {
	orgId: string;
	env: AppEnv;
	customerId: string;
	routingKey: string;
	lockReceiptKey: string | null | undefined;
	idempotencyKey?: string | null;
	customerEntitlementDeductions: { feature_id?: string }[];
	fallbackFeatureId: string;
}) => {
	const balanceKeysByFeatureId: Record<string, string> = {};
	for (const deductionEntry of customerEntitlementDeductions) {
		const targetFeatureId = deductionEntry.feature_id ?? fallbackFeatureId;
		if (balanceKeysByFeatureId[targetFeatureId]) continue;
		balanceKeysByFeatureId[targetFeatureId] = buildSharedFullSubjectBalanceKey({
			orgId,
			env,
			customerId,
			featureId: targetFeatureId,
		});
	}

	const balanceFeatureIds = Object.keys(balanceKeysByFeatureId);
	const balanceKeyIndexByFeatureId: Record<string, number> = {};
	for (let i = 0; i < balanceFeatureIds.length; i++) {
		balanceKeyIndexByFeatureId[balanceFeatureIds[i]] =
			BALANCE_KEYS_START_INDEX + i;
	}

	const keys: string[] = new Array(
		BALANCE_KEYS_START_INDEX - 1 + balanceFeatureIds.length,
	);
	keys[ROUTING_KEY_INDEX - 1] = routingKey;
	keys[LOCK_RECEIPT_KEY_INDEX - 1] = lockReceiptKey ?? "";
	keys[IDEMPOTENCY_KEY_INDEX - 1] = idempotencyKey ?? "";
	for (let i = 0; i < balanceFeatureIds.length; i++) {
		keys[BALANCE_KEYS_START_INDEX - 1 + i] =
			balanceKeysByFeatureId[balanceFeatureIds[i]];
	}

	return { keys, balanceKeyIndexByFeatureId };
};
