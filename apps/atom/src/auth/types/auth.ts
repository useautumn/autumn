import type { Slots } from "../../slots/types/slots.js";

/** What may this token use? The data it opens, or null when it opens nothing. */
export type Auth = {
	authorize(params: { token: string }): Slots | null;
	close(): void;
};
