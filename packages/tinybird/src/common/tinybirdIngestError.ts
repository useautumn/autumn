/** A request failed after the ones before it wrote `writtenRows` rows; resending from there skips what landed. */
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
