import { shedsDeadlines } from "../../experiments/deadlineShed.js";
import { readAbandonedAt } from "../answerDeadline.js";
import { RequestAbandonedError } from "./deadlineShedErrors.js";

/** Arm B: before any decision, a request whose caller has already given up is dropped. */
export function assertNotAbandoned({
	abandonedAt = readAbandonedAt(),
	now = performance.now(),
}: {
	abandonedAt?: number;
	now?: number;
} = {}): void {
	if (abandonedAt === undefined || now < abandonedAt) return;
	if (shedsDeadlines()) throw new RequestAbandonedError();
}
