import {
	addDuration,
	type Entitlement,
	type EntitlementExpiry,
} from "@autumn/shared";

export const entitlementToExpiry = ({
	entitlement,
}: {
	entitlement: Pick<Entitlement, "expiry_duration" | "expiry_length">;
}): EntitlementExpiry | null => {
	const { expiry_duration: duration, expiry_length: length } = entitlement;
	if (!duration || length == null || length <= 0) return null;
	return { duration, length };
};

export const initExpiresAt = ({
	expiry,
	now,
}: {
	expiry: EntitlementExpiry;
	now: number;
}): number =>
	addDuration({
		now,
		durationType: expiry.duration,
		durationLength: expiry.length,
	});
