import { AsyncLocalStorage } from "node:async_hooks";
import { createTwStripeRequestDeadline } from "./createTwStripeRequestDeadline";
import { isTwWorkerMode } from "./twStripeMode";
import type { TwStripeLane } from "./types/twStripeAdmission";
import type { TwStripeRequestContext } from "./types/twStripeRequestContext";

let requestContext: AsyncLocalStorage<TwStripeRequestContext> | undefined;
const getRequestContext = () => {
	requestContext ??= new AsyncLocalStorage<TwStripeRequestContext>();
	return requestContext;
};

export const getTwStripeLane = (): TwStripeLane =>
	requestContext?.getStore()?.lane ?? "bulk";

export const getTwStripeRequestDeadline = () =>
	requestContext?.getStore()?.deadline;

export const TW_TEST_FILE_HEADER = "x-tw-test-file";

/** Test processes are tagged by env; server requests inherit the tag of the test call that caused them. */
export const getTwStripeFileTag = (): string | undefined =>
	requestContext?.getStore()?.fileTag ?? process.env.TW_TEST_FILE;

export const withTwStripeFileTag = <T>({
	fileTag,
	run,
}: {
	fileTag: string | undefined;
	run: () => T;
}): T => {
	if (!fileTag || !isTwWorkerMode()) return run();
	const storage = getRequestContext();
	return storage.run({ ...storage.getStore(), fileTag }, run);
};

export const withTwStripeRequestDeadline = <T>({
	run,
	timeoutMs,
	signal,
}: {
	run: () => T;
	timeoutMs: number;
	signal?: AbortSignal;
}): T => {
	if (!isTwWorkerMode()) return run();
	const storage = getRequestContext();
	const deadline = createTwStripeRequestDeadline({ timeoutMs, signal });
	return storage.run({ ...storage.getStore(), deadline }, run);
};

export const withTwStripeWebhookPriority = <T>(run: () => T): T => {
	if (!isTwWorkerMode()) return run();
	const storage = getRequestContext();
	return storage.run({ ...storage.getStore(), lane: "webhook" }, run);
};
