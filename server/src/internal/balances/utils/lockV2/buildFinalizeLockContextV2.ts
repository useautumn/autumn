import type { Feature, FullSubject } from "@autumn/shared";
import { type FinalizeLockParamsV0, findFeatureById } from "@autumn/shared";
import type { Redis } from "ioredis";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { LockReceipt } from "@/internal/balances/utils/lock/fetchLockReceipt.js";
import {
	calculateLockValue,
	calculateUnwindValue,
} from "@/internal/balances/utils/lock/unwindLockUtils.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";

export type FinalizeLockContextV2 = {
	receipt: LockReceipt;
	lockReceiptKey: string;
	redisInstance: Redis;
	fullSubject: FullSubject;
	feature: Feature;
	lockValue: number;
	finalValue: number;
	unwindValue: number;
	additionalValue: number;
	properties?: Record<string, unknown>;
	deduction: FeatureDeduction;
	deductionOptions: { triggerAutoTopUp: boolean };
};

export const buildFinalizeLockContextV2 = async ({
	ctx,
	params,
	receipt,
	lockReceiptKey,
}: {
	ctx: AutumnContext;
	params: FinalizeLockParamsV0;
	receipt: LockReceipt;
	lockReceiptKey: string;
}): Promise<FinalizeLockContextV2> => {
	const fullSubject = await getOrSetCachedFullSubject({
		ctx,
		customerId: receipt.customer_id,
		entityId: receipt.entity_id ?? undefined,
		source: "runFinalizeLockV2",
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
		redisInstance: redisV2,
		fullSubject,
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
