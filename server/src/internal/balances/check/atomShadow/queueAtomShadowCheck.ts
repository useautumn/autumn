import { runAtomShadowCheck } from "./runAtomShadowCheck.js";

export const queueAtomShadowCheck = (
	params: Parameters<typeof runAtomShadowCheck>[0],
): void => {
	setImmediate(() => void runAtomShadowCheck(params));
};
