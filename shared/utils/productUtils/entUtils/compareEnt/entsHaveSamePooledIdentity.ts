import type { EntitlementWithFeature } from "../../../../models/productModels/entModels/entModels.js";
import { entToPooledBalanceIdentity } from "../../../pooledBalanceUtils/convertPooledBalance/entToPooledBalanceIdentity.js";

const identityKey = (entitlement: EntitlementWithFeature) =>
	JSON.stringify(entToPooledBalanceIdentity({ entitlement }));

export const entsHaveSamePooledIdentity = (
	ent1: EntitlementWithFeature,
	ent2: EntitlementWithFeature,
) => identityKey(ent1) === identityKey(ent2);
