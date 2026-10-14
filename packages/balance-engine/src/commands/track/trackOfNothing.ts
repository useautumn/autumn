import type { WorkerCustomer } from "../../models/subject/rows/workerCustomer.js";
import { isAtomReplay } from "../common/atomSourceToRowChange.js";
import type { TrackCommand } from "./types/trackCommand.js";

/** The command as a track that deducts, records and claims nothing: only its source's seq can still land. */
export const trackOfNothing = ({
	command,
}: {
	command: TrackCommand;
}): TrackCommand => ({
	...command,
	value: 0,
	usageEvent: null,
	enforceOverdueBlock: false,
	lock: undefined,
	idempotency: undefined,
});

/** An Atom's resend of a track the customer already holds deducts nothing. */
export const atomReplayAsNothing = ({
	command,
	customer,
}: {
	command: TrackCommand;
	customer: WorkerCustomer;
}): TrackCommand =>
	command.source && isAtomReplay({ source: command.source, customer })
		? trackOfNothing({ command })
		: command;
