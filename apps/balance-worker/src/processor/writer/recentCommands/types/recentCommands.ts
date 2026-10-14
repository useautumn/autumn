import type { MeteringIdentity, MutationRecord } from "@autumn/balance-engine";

export type RememberedCommand = { fingerprint: string };

export type RecentCommands = {
	remember(params: { mutation: MutationRecord }): void;
	read(params: {
		identity: MeteringIdentity;
		commandId: string;
	}): RememberedCommand | null;
	size(): number;
};
