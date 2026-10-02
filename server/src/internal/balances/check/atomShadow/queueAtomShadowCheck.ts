import { runAtomShadowCheck } from "./runAtomShadowCheck.js";

/** Detached the way the Stripe webhook ack runs its work: the caller's response never waits on the Atom. */
export const queueAtomShadowCheck = (
	params: Parameters<typeof runAtomShadowCheck>[0],
): void => {
	setImmediate(() => void runAtomShadowCheck(params));
};
