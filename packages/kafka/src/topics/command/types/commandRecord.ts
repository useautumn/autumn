import type {
	AtomFinalizeCommand,
	EvictCommand,
	MutatingCommand,
} from "@autumn/balance-engine";

/** What the command topic carries: any command the worker would accept over HTTP, as sent, and an Atom's finalize. */
export type CommandRecord =
	| MutatingCommand
	| EvictCommand
	| AtomFinalizeCommand;
