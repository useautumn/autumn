export class InvalidRecordError extends Error {
	constructor({ cause }: { cause?: unknown } = {}) {
		super("Invalid Kafka record", { cause });
		this.name = "InvalidRecordError";
	}
}

export class UnsupportedRecordVersionError extends Error {
	readonly schemaVersion: number;

	constructor({ schemaVersion }: { schemaVersion: number }) {
		super(`Unsupported Kafka record version: ${schemaVersion}`);
		this.name = "UnsupportedRecordVersionError";
		this.schemaVersion = schemaVersion;
	}
}

export class RecordKeyMismatchError extends Error {
	readonly expectedKey: string;
	readonly receivedKey: string | null;

	constructor({
		expectedKey,
		receivedKey,
	}: {
		expectedKey: string;
		receivedKey: string | null;
	}) {
		super("Kafka record key does not match its payload key");
		this.name = "RecordKeyMismatchError";
		this.expectedKey = expectedKey;
		this.receivedKey = receivedKey;
	}
}
