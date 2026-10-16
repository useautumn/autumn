import type {
	BalanceWorkerClient,
	MigrationRecord,
} from "@autumn/balance-worker-client";

const RECORDS_PER_APPEND = 400;
const APPENDS_IN_FLIGHT = 4;

export const appendLaneRecords = async ({
	client,
	records,
}: {
	client: Pick<BalanceWorkerClient, "appendMigrationRecords">;
	records: readonly MigrationRecord[];
}): Promise<void> => {
	const appends: MigrationRecord[][] = [];
	for (let start = 0; start < records.length; start += RECORDS_PER_APPEND)
		appends.push(records.slice(start, start + RECORDS_PER_APPEND));
	let next = 0;
	const sendNext = async (): Promise<void> => {
		for (let append = appends[next++]; append; append = appends[next++])
			await client.appendMigrationRecords({ records: append });
	};
	await Promise.all(
		Array.from(
			{ length: Math.min(APPENDS_IN_FLIGHT, appends.length) },
			sendNext,
		),
	);
};
