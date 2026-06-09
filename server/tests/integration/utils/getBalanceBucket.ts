import type {
	ApiCustomerV5,
	ApiEntityV2,
	BillingMethod,
	ResetInterval,
} from "@autumn/shared";

export type BalanceSubject = ApiCustomerV5 | ApiEntityV2;
export type BalanceBucket = NonNullable<
	ApiCustomerV5["balances"][string]["breakdown"]
>[number];

export const getBalanceBuckets = ({
	subject,
	featureId,
}: {
	subject: BalanceSubject;
	featureId: string;
}): BalanceBucket[] => subject.balances[featureId]?.breakdown ?? [];

export const getBalanceBucket = ({
	subject,
	featureId,
	planId,
	resetInterval,
	billingMethod,
	includedGrant,
}: {
	subject: BalanceSubject;
	featureId: string;
	planId?: string;
	resetInterval?: ResetInterval | null;
	billingMethod?: BillingMethod;
	includedGrant?: number;
}) => {
	for (const bucket of getBalanceBuckets({ subject, featureId })) {
		if (planId && bucket.plan_id !== planId) continue;
		if (resetInterval === null && bucket.reset !== null) continue;
		if (resetInterval && bucket.reset?.interval !== resetInterval) continue;
		if (billingMethod && bucket.price?.billing_method !== billingMethod) continue;
		if (
			typeof includedGrant !== "undefined" &&
			bucket.included_grant !== includedGrant
		) {
			continue;
		}

		return bucket;
	}

	throw new Error(`Expected balance bucket for feature ${featureId}`);
};
