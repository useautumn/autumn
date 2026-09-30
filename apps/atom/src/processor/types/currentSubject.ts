import type { Catalog, WorkerFullSubject } from "@autumn/balance-engine";
import type { Feature, SharedContext } from "@autumn/shared";

/** The subject a check runs on: the stored rows joined to their catalog, with what rendering the answer reads. */
export type CurrentSubject = {
	fullSubject: WorkerFullSubject;
	catalog: Catalog;
	/** Every feature of the org Atom knows: the shared catalog's, and the customer's own. */
	features: Feature[];
	org: SharedContext["org"];
};
