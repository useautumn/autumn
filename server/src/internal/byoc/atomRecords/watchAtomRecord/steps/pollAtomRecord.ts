import { ErrCode, RecaseError } from "@autumn/shared";
import { refreshAtomRecord } from "../../refreshAtomRecord.js";
import type { AtomContext } from "../../types/atomContext.js";
import type { AtomRecord } from "../../types/atomRecord.js";
import type { AtomRecordPoll } from "../types/watchAtomRecordTypes.js";

/** alien or the stack's Atom did not answer; the watch waits it out rather than failing. */
const isAtomUnavailableError = (error: unknown): boolean =>
	error instanceof RecaseError && error.code === ErrCode.ByocUnavailable;

/** Writes the deployer's latest into the record; an outage is a result to back off from, anything else throws. */
export const pollAtomRecord = async <T extends AtomRecord>({
	ctx,
	record,
}: {
	ctx: AtomContext<T>;
	record: T;
}): Promise<AtomRecordPoll<T>> => {
	try {
		return { ok: true, record: await refreshAtomRecord({ ctx, record }) };
	} catch (error) {
		if (!isAtomUnavailableError(error)) throw error;
		return { ok: false, error };
	}
};
