import { AsyncLocalStorage } from "node:async_hooks";
import { isTwWorkerMode } from "./twStripeMode";
import type { TwStripeLane } from "./types/twStripeAdmission";

let requestContext: AsyncLocalStorage<TwStripeLane> | undefined;
const getRequestContext = () => {
	requestContext ??= new AsyncLocalStorage<TwStripeLane>();
	return requestContext;
};

export const getTwStripeLane = (): TwStripeLane =>
	requestContext?.getStore() ?? "bulk";

export const withTwStripeWebhookPriority = <T>(run: () => T): T => {
	if (!isTwWorkerMode()) return run();
	return getRequestContext().run("webhook", run);
};
