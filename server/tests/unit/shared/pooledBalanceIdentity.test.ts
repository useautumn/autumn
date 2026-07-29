import { expect, test } from "bun:test";
import {
	EntInterval,
	type PooledBalanceIdentity,
	PooledBalanceResetMode,
	pooledBalanceIdentityToKey,
} from "@autumn/shared";

const identity = {
	internalFeatureId: "feature_internal_id",
	interval: EntInterval.Lifetime,
	intervalCount: 1,
	resetCycleAnchor: null,
	resetMode: PooledBalanceResetMode.Lifetime,
	stripeSubscriptionId: null,
	customerLicenseLinkId: null,
	rolloverSignature: "none",
} satisfies Omit<PooledBalanceIdentity, "unlimited">;

test.concurrent(
	"pooled balance identity separates finite and unlimited pools",
	() => {
		const finiteKey = pooledBalanceIdentityToKey({
			identity: { ...identity, unlimited: false },
		});
		const unlimitedKey = pooledBalanceIdentityToKey({
			identity: { ...identity, unlimited: true },
		});

		expect(finiteKey).not.toBe(unlimitedKey);
	},
);
