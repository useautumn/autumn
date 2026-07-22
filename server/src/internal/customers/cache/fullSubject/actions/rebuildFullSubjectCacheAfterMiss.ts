import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type CustomerBalanceSyncDb,
	withCustomerBalanceSyncLock,
} from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { rehydrateWithLiveBalances } from "./rehydrateWithLiveBalances.js";
import { setCachedFullSubject } from "./setCachedFullSubject/setCachedFullSubject.js";

type CachedSubjectRead = {
	fullSubject: FullSubject | undefined;
	subjectViewEpoch: number;
};

/**
 * Rebuilds a missing FullSubject cache while serialized with customer balance
 * lifecycle mutations. The caller supplies its full or feature-filtered cache
 * reader; both paths share the same lock, recheck, DB snapshot, and losing-fill
 * handling.
 */
export const rebuildFullSubjectCacheAfterMiss = async ({
	ctx,
	customerId,
	entityId,
	source,
	readCachedSubject,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
	readCachedSubject: ({
		balanceSyncDb,
		source,
	}: {
		balanceSyncDb: CustomerBalanceSyncDb;
		source: string;
	}) => Promise<CachedSubjectRead>;
}): Promise<FullSubject> =>
	withCustomerBalanceSyncLock({
		ctx,
		customerId,
		callback: async ({ db }) => {
			// A lifecycle or another miss may have filled the cache while this
			// request waited. Recheck before querying Postgres.
			const lockedCacheRead = await readCachedSubject({
				balanceSyncDb: db,
				source: `${source ?? "unknown"}:after-balance-sync-lock`,
			});
			if (lockedCacheRead.fullSubject) return lockedCacheRead.fullSubject;

			let result = await getFullSubjectNormalized({
				ctx,
				customerId,
				entityId,
				balanceSyncDb: db,
			});
			if (!result) {
				if (entityId) throw new EntityNotFoundError({ entityId });
				throw new CustomerNotFoundError({ customerId });
			}

			let { normalized, fullSubject } = result;
			let fetchedSubjectViewEpoch = lockedCacheRead.subjectViewEpoch;

			// One retry covers ordinary cache-fill contention (CACHE_EXISTS) and
			// an epoch change during a lazy reset (STALE_WRITE). The reread always
			// wins over this request's DB snapshot.
			for (let attempt = 0; attempt < 2; attempt += 1) {
				const setResult = await setCachedFullSubject({
					ctx,
					normalized,
					fetchedSubjectViewEpoch,
				});

				if (setResult === "OK") {
					// HSETNX preserves same-epoch deductions that raced this fill.
					const withLiveBalances = await rehydrateWithLiveBalances({
						ctx,
						normalized,
					});
					return withLiveBalances ?? fullSubject;
				}

				if (setResult === "FAILED") {
					const withLiveBalances = await rehydrateWithLiveBalances({
						ctx,
						normalized,
					});
					return withLiveBalances ?? fullSubject;
				}

				const winner = await readCachedSubject({
					balanceSyncDb: db,
					source: `${source ?? "unknown"}:cache-fill-${setResult.toLowerCase()}`,
				});
				if (winner.fullSubject) return winner.fullSubject;
				fetchedSubjectViewEpoch = winner.subjectViewEpoch;

				if (setResult === "STALE_WRITE") {
					result = await getFullSubjectNormalized({
						ctx,
						customerId,
						entityId,
						balanceSyncDb: db,
					});
					if (!result) {
						if (entityId) throw new EntityNotFoundError({ entityId });
						throw new CustomerNotFoundError({ customerId });
					}
					normalized = result.normalized;
					fullSubject = result.fullSubject;
				}
			}

			return fullSubject;
		},
		onTransactionFailure: () =>
			deleteCachedFullCustomer({
				ctx,
				customerId,
				...(entityId ? { entityId } : {}),
				source: "full-subject-cache-fill-transaction-failure",
			}),
	});
