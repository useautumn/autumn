import type { Slots } from "../../slots/types/slots.js";

/** What may this token use? The data it opens, or null when it opens nothing. */
export type Auth = {
	authorize(params: { token: string }): Slots | null;
	/** Where a queued push lands: an org's own Atom has one folder, a multi-tenant one the folder the push names. */
	pushSlots(params: { atomId: string | null }): Slots | null;
	close(): void;
};
