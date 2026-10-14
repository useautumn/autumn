export const BatchMigrationErrorName = {
	Stall: "BatchMigrationStallError",
	CacheInvalidation: "BatchMigrationCacheInvalidationError",
	PageLimit: "BatchMigrationPageLimitError",
} as const;

export class BatchMigrationStallError extends Error {
	readonly phase: string;

	constructor({ phase, message }: { phase: string; message: string }) {
		super(message);
		this.name = BatchMigrationErrorName.Stall;
		this.phase = phase;
	}
}

export class BatchMigrationCacheInvalidationError extends BatchMigrationStallError {
	constructor({ message }: { message: string }) {
		super({ phase: "finalize_caches", message });
		this.name = BatchMigrationErrorName.CacheInvalidation;
	}
}

export class BatchMigrationPageLimitError extends Error {
	constructor({ maxPages }: { maxPages: number }) {
		super(`batch-migration: exceeded ${maxPages} pages — aborting run`);
		this.name = BatchMigrationErrorName.PageLimit;
	}
}
