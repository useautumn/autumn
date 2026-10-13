import type { NativeReadCache } from "../state/nativeSubjects/nativeReadCache.js";
import { nativeSubjectKey } from "../state/nativeSubjects/nativeSubjects.js";
import type { StoredSubject } from "../state/types/storedSubject.js";
import { check } from "./actions/check/check.js";
import { checkResponseToJson } from "./actions/check/checkResponseToJson.js";
import type { CheckContext, SlotProcessor } from "./types/slotProcessor.js";

/** The owner holds no shared copy: it decides, reading its file and pulling on a miss as it always does. */
class NotSharedError extends Error {}

export type NativeReadStats = { answered: number; hops: number };

/** Per thread: checks answered here from the shared store, and those that still went to the owner. */
export const nativeReadStats: NativeReadStats = { answered: 0, hops: 0 };

/**
 * A slot another thread owns: its checks are decided here from the shared copy, with no call to the owner.
 * Writes, and a check whose subject the owner holds no copy of, still go to the owner.
 */
export const createNativeReadProcessor = ({
	ctx,
	databasePath,
	owner,
	readCache,
}: {
	ctx: Omit<CheckContext, "sqliteStore">;
	databasePath: string;
	owner: SlotProcessor;
	readCache: NativeReadCache;
}): SlotProcessor => {
	const sqliteStore = {
		readSubject: (params: {
			customerId: string;
			entityId: string | null;
		}): StoredSubject => {
			const subject = readCache.read({
				key: nativeSubjectKey({ databasePath, ...params }),
			});
			if (!subject) throw new NotSharedError();
			return subject;
		},
	};
	const checkCtx: CheckContext = { ...ctx, sqliteStore };

	return {
		check: async ({ request }) => {
			try {
				const response = check({ ctx: checkCtx, request });
				nativeReadStats.answered += 1;
				return {
					json: checkResponseToJson({ response }),
					allowed: response.allowed,
				};
			} catch (error) {
				if (!(error instanceof NotSharedError)) throw error;
				nativeReadStats.hops += 1;
				return owner.check({ request });
			}
		},
		setSubject: owner.setSubject,
	};
};
