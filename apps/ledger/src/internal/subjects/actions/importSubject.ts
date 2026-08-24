import type { AppEnv } from "@autumn/shared";
import { LedgerNotImplementedError } from "../../../lib/ledgerNotImplementedError.js";
import type { SubjectContext } from "../types/subjectContext.js";

// First sight of a customer: the Postgres selects that seed subject state.
export const importSubject = (_params: {
	ctx: SubjectContext;
	customerId: string;
	orgId: string;
	env: AppEnv;
}): Promise<void> => {
	throw new LedgerNotImplementedError("subject import");
};
