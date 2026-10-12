import type { Catalog, SubjectState } from "@autumn/balance-engine";
import type { SharedContext } from "@autumn/shared";

/** `POST /v1/subjects.set`: one subject as its worker holds it, with the org settings a check reads. Pushed by herald, pulled by an Atom. */
export type AtomSubjectBody = {
	state: SubjectState;
	catalog: Catalog;
	org: SharedContext["org"];
	/** A string: log offsets are 64-bit. Every record at or below it is in `state`. */
	log_offset: string;
	/** When Autumn read the subject from its worker, in epoch ms. */
	read_at: number;
	/** On a customer push, the offset of its latest evict: the Atom forwards checks on entities read before it. */
	customer_version?: string;
};
