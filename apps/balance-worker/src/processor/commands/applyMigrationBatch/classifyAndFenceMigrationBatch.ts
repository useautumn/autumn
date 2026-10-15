import {
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	parseApplyBillingPlanRequest,
} from "@autumn/balance-engine";
import type { ColdMigrationOp } from "@autumn/postgres";
import type { PartitionProcessorScope } from "../../types/partitionProcessor.js";
import { coldOpsOf } from "./coldOpsOf.js";
import type {
	ClassifiedMigrationItem,
	MigrationLaneItem,
} from "./types/migrationLaneItem.js";

export type ColdMigrationItem = ClassifiedMigrationItem & {
	ops: ColdMigrationOp[];
};

export type ClassifiedMigrationBatch = {
	cold: ColdMigrationItem[];
	resident: ClassifiedMigrationItem[];
	release: () => void;
};

const isColdCustomer = ({
	scope,
	classified,
}: {
	scope: PartitionProcessorScope;
	classified: ClassifiedMigrationItem;
}): boolean => {
	const { writer, subjectHydrator } = scope.ctx;
	const { customerKey, identity } = classified;
	const subjectKey = meteringIdentityToSubjectKey({
		identity: { ...identity, entityId: null },
	});
	return (
		!writer.holdsCustomer({ customerKey, subjectKey }) &&
		!subjectHydrator.isLoadingCustomer({ customerKey }) &&
		!scope.customerPlans.tails.has(customerKey)
	);
};

export const parseMigrationLaneItems = ({
	items,
}: {
	items: readonly MigrationLaneItem[];
}): ClassifiedMigrationItem[] =>
	items.map((item) => {
		const request = parseApplyBillingPlanRequest({ input: item.request });
		const { command } = request;
		return {
			item,
			request,
			command,
			identity: command.identity,
			customerKey: meteringIdentityToPartitionKey({
				identity: command.identity,
			}),
		};
	});

/** Synchronous from the first residency read to the last fence: no load of a cold customer can start in between. */
export const classifyAndFenceMigrationBatch = ({
	scope,
	items,
}: {
	scope: PartitionProcessorScope;
	items: readonly ClassifiedMigrationItem[];
}): ClassifiedMigrationBatch => {
	const cold: ColdMigrationItem[] = [];
	const resident: ClassifiedMigrationItem[] = [];
	const seen = new Set<string>();
	for (const classified of items) {
		const ops = coldOpsOf({ command: classified.command });
		const firstInBatch = !seen.has(classified.customerKey);
		seen.add(classified.customerKey);
		if (ops && firstInBatch && isColdCustomer({ scope, classified }))
			cold.push({ ...classified, ops });
		else resident.push(classified);
	}
	const release = scope.ctx.writer.fenceCustomers({
		customerKeys: cold.map(({ customerKey }) => customerKey),
	});
	for (const { identity } of cold)
		scope.ctx.subjectHydrator.refreshSnapshots({
			customer: { ...identity, entityId: null },
			subjects: [],
		});
	return { cold, resident, release };
};
