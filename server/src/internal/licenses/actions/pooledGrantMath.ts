export type PooledGrantState = {
	desired: number;
	periodGrantedAllowance: number;
	periodKey: number | null;
	currentAllowance: number;
	nextResetAt: number | null;
	expiresAt: number | null;
	now: number;
};

export type PooledGrantTransition = {
	balanceDelta: number;
	periodGrantedAllowance: number;
	periodKey: number | null;
	allowance: number;
	expireNow: boolean;
	restore: boolean;
	resetBalanceTo: number | null;
	reanchorReset: boolean;
};

/**
 * Pure marker math for pooled license grants: period_granted_allowance is a
 * per-period high-water mark of desired, so churn can never re-mint credits.
 */
export const computePooledGrantTransition = ({
	desired,
	periodGrantedAllowance,
	periodKey,
	currentAllowance,
	nextResetAt,
	expiresAt,
	now,
}: PooledGrantState): PooledGrantTransition => {
	const expired = expiresAt !== null && expiresAt <= now;

	if (desired <= 0) {
		return {
			balanceDelta: 0,
			periodGrantedAllowance,
			periodKey,
			allowance: 0,
			expireNow: !expired,
			restore: false,
			resetBalanceTo: null,
			reanchorReset: false,
		};
	}

	if (expired) {
		const periodElapsed = nextResetAt !== null && nextResetAt <= now;
		if (periodElapsed) {
			return {
				balanceDelta: 0,
				periodGrantedAllowance: desired,
				periodKey: null,
				allowance: desired,
				expireNow: false,
				restore: true,
				resetBalanceTo: desired,
				reanchorReset: true,
			};
		}
	}

	let marker = periodGrantedAllowance;
	let key = periodKey;
	if (key !== nextResetAt) {
		marker = currentAllowance;
		key = nextResetAt;
	}

	const delta = desired - marker;
	const balanceDelta = delta > 0 ? delta : 0;

	return {
		balanceDelta,
		periodGrantedAllowance: balanceDelta > 0 ? desired : marker,
		periodKey: key,
		allowance: desired,
		expireNow: false,
		restore: expired,
		resetBalanceTo: null,
		reanchorReset: false,
	};
};
