import type { Feature, FullCustomer } from "@autumn/shared";
import { type FinalizeLockParamsV0, findFeatureById } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	fetchLockReceipt,
	type LockReceipt,
} from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import {
	calculateLockValue,
	calculateUnwindValue,
} from "@/internal/balances/utils/lock/unwindLockUtils.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";

export type FinalizeLockContext = {
	receipt: LockReceipt;
	lockReceiptKey: string;
	fullCustomer: FullCustomer;
	feature: Feature;
	lockValue: number;
	finalValue: number;
	unwindValue: number;
	additionalValue: number;
	properties?: Record<string, unknown>;
	deduction: FeatureDeduction;
	deductionOptions: { triggerAutoTopUp: boolean };
};

export const buildFinalizeLockContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: FinalizeLockParamsV0;
}): Promise<FinalizeLockContext> => {
	const { receipt, lockReceiptKey } = await fetchLockReceipt({
		ctx,
		lockId: params.lock_id,
	});

	const fullCustomer = await getOrSetCachedFullCustomer({
		ctx,
		customerId: receipt.customer_id,
		entityId: receipt.entity_id ?? undefined,
		source: "runFinalizeLock",
	});

	const lockValue = calculateLockValue({ items: receipt.items });
	const finalValue =
		params.action === "release" ? 0 : (params.override_value ?? lockValue);

	const { unwindValue, additionalValue } = calculateUnwindValue({
		receipt,
		finalValue,
	});

	const feature = findFeatureById({
		features: ctx.features,
		featureId: receipt.feature_id,
		errorOnNotFound: true,
	});

	return {
		receipt,
		lockReceiptKey,
		fullCustomer,
		feature,
		lockValue,
		finalValue,
		unwindValue,
		additionalValue,
		properties: params.properties,
		deduction: {
			feature,
			deduction: additionalValue,
			lockReceipt: receipt,
			unwindValue,
			lockReceiptKey,
		},
		deductionOptions: { triggerAutoTopUp: true },
	};
};
