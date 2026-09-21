export type MigrationBatchResultStorage<Result, Stored> = {
	toStored: (args: { result: Result }) => Stored;
	fromStored: (args: { result: Stored }) => Result;
};
