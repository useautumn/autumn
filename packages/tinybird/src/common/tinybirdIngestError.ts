export class TinybirdIngestError extends Error {
	readonly writtenRows: number;

	constructor({ writtenRows, cause }: { writtenRows: number; cause: unknown }) {
		super(`Tinybird ingest failed after ${writtenRows} written rows`, {
			cause,
		});
		this.name = "TinybirdIngestError";
		this.writtenRows = writtenRows;
	}
}
