import type { EntitlementWithFeature } from "../../../../models/productModels/entModels/entModels.js";
import { entToPooledBalanceIdentity } from "../../../pooledBalanceUtils/convertPooledBalance/entToPooledBalanceIdentity.js";

const identityKey = (entitlement: EntitlementWithFeature) =>
	JSON.stringify(entToPooledBalanceIdentity({ entitlement }));

/** True when both entitlements derive the same pool identity — a transition
 * between them is an in-place pool change, not a re-mint. */
export const entsHaveSamePooledIdentity = (
	ent1: EntitlementWithFeature,
	ent2: EntitlementWithFeature,
) => identityKey(ent1) === identityKey(ent2);
