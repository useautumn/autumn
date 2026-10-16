import type { MeteringIdentity } from "@autumn/balance-engine";
import type { MigrationMessage } from "@autumn/kafka";

export type MigrationRecord = {
	identity: MeteringIdentity;
	value: string;
};

export type MigrationLog = {
	append(params: { messages: readonly MigrationMessage[] }): Promise<void>;
};
