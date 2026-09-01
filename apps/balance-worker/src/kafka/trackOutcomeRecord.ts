import {
	meteringPartitionKeyOf,
	parseTrackOutcome,
	type TrackOutcome,
} from "@autumn/balance-engine";

export type KafkaTrackOutcomeRecordEnvelope = {
	schemaVersion: 1;
	type: "track_outcome";
	payload: TrackOutcome;
};

export class InvalidKafkaTrackOutcomeRecordError extends Error {
	constructor({ cause }: { cause?: unknown } = {}) {
		super("Invalid Kafka track outcome record", { cause });
		this.name = "InvalidKafkaTrackOutcomeRecordError";
	}
}

export class UnsupportedKafkaTrackOutcomeRecordVersionError extends Error {
	readonly schemaVersion: number;

	constructor({ schemaVersion }: { schemaVersion: number }) {
		super(`Unsupported Kafka track outcome record version: ${schemaVersion}`);
		this.name = "UnsupportedKafkaTrackOutcomeRecordVersionError";
		this.schemaVersion = schemaVersion;
	}
}

export class KafkaTrackOutcomeKeyMismatchError extends Error {
	readonly expectedKey: string;
	readonly receivedKey: string | null;

	constructor({
		expectedKey,
		receivedKey,
	}: {
		expectedKey: string;
		receivedKey: string | null;
	}) {
		super("Kafka track outcome key does not match its customer identity");
		this.name = "KafkaTrackOutcomeKeyMismatchError";
		this.expectedKey = expectedKey;
		this.receivedKey = receivedKey;
	}
}

const expectedEnvelopeKeys = new Set(["schemaVersion", "type", "payload"]);

const parseEnvelope = ({
	input,
}: {
	input: unknown;
}): KafkaTrackOutcomeRecordEnvelope => {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		throw new InvalidKafkaTrackOutcomeRecordError();
	}

	const record = input as Record<string, unknown>;
	if (
		Object.keys(record).length !== expectedEnvelopeKeys.size ||
		Object.keys(record).some((key) => !expectedEnvelopeKeys.has(key))
	) {
		throw new InvalidKafkaTrackOutcomeRecordError();
	}
	if (record.schemaVersion !== 1) {
		if (typeof record.schemaVersion === "number") {
			throw new UnsupportedKafkaTrackOutcomeRecordVersionError({
				schemaVersion: record.schemaVersion,
			});
		}
		throw new InvalidKafkaTrackOutcomeRecordError();
	}
	if (record.type !== "track_outcome") {
		throw new InvalidKafkaTrackOutcomeRecordError();
	}

	let payload: TrackOutcome;
	try {
		payload = parseTrackOutcome({ input: record.payload });
	} catch (cause) {
		throw new InvalidKafkaTrackOutcomeRecordError({ cause });
	}

	return {
		schemaVersion: 1,
		type: "track_outcome",
		payload,
	};
};

export const serializeKafkaTrackOutcomeRecord = ({
	outcome,
}: {
	outcome: TrackOutcome;
}): { key: Buffer; value: Buffer } => {
	const payload = parseTrackOutcome({ input: outcome });
	const envelope: KafkaTrackOutcomeRecordEnvelope = {
		schemaVersion: 1,
		type: "track_outcome",
		payload,
	};

	return {
		key: Buffer.from(
			meteringPartitionKeyOf({ identity: payload.identity }),
			"utf8",
		),
		value: Buffer.from(JSON.stringify(envelope), "utf8"),
	};
};

export const parseKafkaTrackOutcomeRecord = ({
	key,
	value,
}: {
	key: Buffer | null;
	value: Buffer | null;
}): TrackOutcome => {
	if (!value) throw new InvalidKafkaTrackOutcomeRecordError();

	let input: unknown;
	try {
		input = JSON.parse(value.toString("utf8"));
	} catch (cause) {
		throw new InvalidKafkaTrackOutcomeRecordError({ cause });
	}

	const { payload } = parseEnvelope({ input });
	const expectedKey = meteringPartitionKeyOf({ identity: payload.identity });
	const receivedKey = key?.toString("utf8") ?? null;
	if (receivedKey !== expectedKey) {
		throw new KafkaTrackOutcomeKeyMismatchError({
			expectedKey,
			receivedKey,
		});
	}

	return payload;
};
