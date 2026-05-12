import type { NormalizedFullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs.js";
import type { CachedFullSubject } from "../../fullSubjectCacheModel.js";
import type { SetCachedFullSubjectResult } from "./fullSubjectWriteTypes.js";
import type { SharedBalanceWrite } from "./setSharedFullSubjectBalances.js";

export const logSetCachedFullSubject = ({
	ctx,
	subjectLabel,
	result,
	cached,
	balanceWrites,
	normalized,
}: {
	ctx: AutumnContext;
	subjectLabel: string;
	result: SetCachedFullSubjectResult;
	cached: CachedFullSubject;
	balanceWrites: SharedBalanceWrite[];
	normalized: NormalizedFullSubject;
}): void => {
	addToExtraLogs({
		ctx,
		extras: {
			setCachedFullSubject: {
				result,
				subjectLabel,
				customerEntitlementIdsByFeatureId:
					cached.customerEntitlementIdsByFeatureId,
				meteredFeatures: cached.meteredFeatures,
				balanceWrites: balanceWrites.map(({ balanceKey, fields }) => ({
					balanceKey,
					fieldNames: Object.keys(fields),
				})),
				normalizedCustomerEntitlementIds: normalized.customer_entitlements.map(
					(ce) => ({
						id: ce.id,
						feature_id: ce.feature_id,
						internal_entity_id: ce.internal_entity_id ?? null,
						customer_product_id: ce.customer_product_id ?? null,
					}),
				),
			},
		},
	});
};
