import type { MeteringIdentity } from "@autumn/balance-engine";

/** `POST /v1/subjects.delete`: a customer or entity its worker no longer holds, at a version. Pushed by herald. */
export type AtomDeletedSubjectBody = {
	identity: MeteringIdentity;
	/** The record that found the subject gone; a string, as log offsets are 64-bit. */
	log_offset: string;
	/** When Autumn read the subject from its worker, in epoch ms. */
	read_at: number;
};
