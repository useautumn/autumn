import type { EvictCommand, MutatingCommand } from "@autumn/balance-engine";

export type CommandRecord = MutatingCommand | EvictCommand;
