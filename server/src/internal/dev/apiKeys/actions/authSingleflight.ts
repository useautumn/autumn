import { variant } from "@autumn/edge-config";
import type { ApiKeyVerificationData } from "../../repos/getApiKeyVerificationData.js";

/**
 * ATMN-603: under B one verification per hashed key is in flight per process and every concurrent caller
 * shares it; A verifies on every call. The L1 TTL and the Redis budget are untouched, so the fallback is
 * still Postgres past 200 ms — but once per key per miss instead of once per in-flight request.
 */
export const AUTH_SINGLEFLIGHT_EXPERIMENT = "auth-singleflight";

type Flight = Promise<ApiKeyVerificationData | null>;

const flights = new Map<string, Flight>();

export const authSingleflightArm = () => variant(AUTH_SINGLEFLIGHT_EXPERIMENT);

/** The key's verification already in flight, or a new one that stays joinable until it settles. */
export const joinAuthFlight = ({
	hashedKey,
	verify,
}: {
	hashedKey: string;
	verify: () => Flight;
}): Flight => {
	const inFlight = flights.get(hashedKey);
	if (inFlight) return inFlight;
	const flight = verify().finally(() => flights.delete(hashedKey));
	flights.set(hashedKey, flight);
	return flight;
};

export const _authFlightsInFlightForTesting = () => flights.size;
