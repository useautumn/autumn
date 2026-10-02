import { BALANCE_WORKER_SUBJECT_LOAD_CONCURRENCY } from "@autumn/env/balanceWorkerConstants";
import { databaseTimings } from "../../logging/databaseTimings.js";
import { createSubjectLoadGate } from "./createSubjectLoadGate.js";

export const subjectLoadGate = createSubjectLoadGate({
	config: { limit: BALANCE_WORKER_SUBJECT_LOAD_CONCURRENCY },
	ctx: { onAdmit: databaseTimings.recordSubjectLoadWait },
});
