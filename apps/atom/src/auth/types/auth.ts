import type { Slots } from "../../slots/types/slots.js";

/** What may this token use? The data it opens, or null when it opens nothing. */
export type Auth = {
	authorize(params: { token: string }): Slots | null;
	/** The folder a queued push or another thread's call names: an org's own Atom has one, a multi-tenant one many. */
	slotsFor(params: { atomId: string | null }): Slots | null;
	close(): void;
};
