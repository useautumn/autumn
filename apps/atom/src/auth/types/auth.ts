import type { Slots } from "../../slots/types/slots.js";

export type Auth = {
	authorize(params: { token: string }): Slots | null;
	slotsFor(params: { atomId: string | null }): Slots | null;
	close(): void;
};
