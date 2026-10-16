import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
} from "@autumn/balance-engine";
import { meteringIdentityToPartition } from "../../partitioning/meteringIdentityToPartition.js";

export type MigrationMessage = {
	key: string;
	value: string;
	partition: number;
};

export function migrationMessageOf({
	identity,
	value,
	partitionCount,
}: {
	identity: MeteringIdentity;
	value: string;
	partitionCount: number;
}): MigrationMessage {
	return {
		key: meteringIdentityToPartitionKey({ identity }),
		value,
		partition: meteringIdentityToPartition({ identity, partitionCount }),
	};
}
