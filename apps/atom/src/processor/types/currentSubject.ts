import type { Catalog, WorkerFullSubject } from "@autumn/balance-engine";
import type { Feature, SharedContext } from "@autumn/shared";

export type CurrentSubject = {
	fullSubject: WorkerFullSubject;
	catalog: Catalog;
	features: Feature[];
	org: SharedContext["org"];
};
