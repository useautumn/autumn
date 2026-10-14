import { ErrCode, RecaseError } from "@autumn/shared";
import { refreshAtomRecord } from "../../refreshAtomRecord.js";
import type { AtomContext } from "../../types/atomContext.js";
import type { AtomRecord } from "../../types/atomRecord.js";
import type { AtomRecordPoll } from "../types/watchAtomRecordTypes.js";

const isAtomUnavailableError = (error: unknown): boolean =>
	error instanceof RecaseError && error.code === ErrCode.ByocUnavailable;

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
