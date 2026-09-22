import type { MutatingCommand } from "@autumn/balance-engine";

/** What the command topic carries: any command the worker would accept over HTTP, as sent. */
export type CommandRecord = MutatingCommand;
