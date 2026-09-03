import {
	meteringPartitionKeyOf,
	parseStateInitializedEvent,
	parseTrackOutcome,
	type StateInitializedEvent,
	type TrackOutcome,
} from "@autumn/balance-engine";

export type KafkaMeteringRecord = StateInitializedEvent | TrackOutcome;

export type KafkaMeteringRecordEnvelope =
	| {
			schemaVersion: 1;
			type: "state_initialized";
			payload: StateInitializedEvent;
	  }
	| {
			schemaVersion: 1;
			type: "track_outcome";
			payload: TrackOutcome;
	  };

export class InvalidKafkaMeteringRecordError extends Error {
	constructor({ cause }: { cause?: unknown } = {}) {
		super("Invalid Kafka metering record", { cause });
		this.name = "InvalidKafkaMeteringRecordError";
	}
}

export class UnsupportedKafkaMeteringRecordVersionError extends Error {
	readonly schemaVersion: number;

	constructor({ schemaVersion }: { schemaVersion: number }) {
		super(`Unsupported Kafka metering record version: ${schemaVersion}`);
		this.name = "UnsupportedKafkaMeteringRecordVersionError";
		this.schemaVersion = schemaVersion;
	}
}

export class KafkaMeteringRecordKeyMismatchError extends Error {
	readonly expectedKey: string;
	readonly receivedKey: string | null;

	constructor({
		expectedKey,
		receivedKey,
	}: {
		expectedKey: string;
		receivedKey: string | null;
	}) {
		super("Kafka metering record key does not match its customer identity");
		this.name = "KafkaMeteringRecordKeyMismatchError";
		this.expectedKey = expectedKey;
		this.receivedKey = receivedKey;
	}
}

const expectedEnvelopeKeys = new Set(["schemaVersion", "type", "payload"]);

const parseEnvelope = ({
	input,
}: {
	input: unknown;
}): KafkaMeteringRecordEnvelope => {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		throw new InvalidKafkaMeteringRecordError();
	}

	const envelope = input as Record<string, unknown>;
	if (
		Object.keys(envelope).length !== expectedEnvelopeKeys.size ||
		Object.keys(envelope).some((key) => !expectedEnvelopeKeys.has(key))
	) {
		throw new InvalidKafkaMeteringRecordError();
	}
	if (envelope.schemaVersion !== 1) {
		if (typeof envelope.schemaVersion === "number") {
			throw new UnsupportedKafkaMeteringRecordVersionError({
				schemaVersion: envelope.schemaVersion,
			});
		}
		throw new InvalidKafkaMeteringRecordError();
	}

	try {
		if (envelope.type === "state_initialized") {
			return {
				schemaVersion: 1,
				type: "state_initialized",
				payload: parseStateInitializedEvent({ input: envelope.payload }),
			};
		}
		if (envelope.type === "track_outcome") {
			return {
				schemaVersion: 1,
				type: "track_outcome",
				payload: parseTrackOutcome({ input: envelope.payload }),
			};
		}
	} catch (cause) {
		throw new InvalidKafkaMeteringRecordError({ cause });
	}

	throw new InvalidKafkaMeteringRecordError();
};

const identityOf = ({ record }: { record: KafkaMeteringRecord }) =>
	record.type === "state_initialized" ? record.state.identity : record.identity;

const serializeKafkaMeteringRecord = ({
	record,
}: {
	record: KafkaMeteringRecord;
}): { key: Buffer; value: Buffer } => {
	const envelope = parseEnvelope({
		input: {
			schemaVersion: 1,
			type: record.type,
			payload: record,
		},
	});

	return {
		key: Buffer.from(
			meteringPartitionKeyOf({ identity: identityOf({ record }) }),
			"utf8",
		),
		value: Buffer.from(JSON.stringify(envelope), "utf8"),
	};
};

export const serializeKafkaStateInitializedRecord = ({
	initialization,
}: {
	initialization: StateInitializedEvent;
}): { key: Buffer; value: Buffer } =>
	serializeKafkaMeteringRecord({ record: initialization });

export const serializeKafkaTrackOutcomeRecord = ({
	outcome,
}: {
	outcome: TrackOutcome;
}): { key: Buffer; value: Buffer } =>
	serializeKafkaMeteringRecord({ record: outcome });

export const parseKafkaMeteringRecord = ({
	key,
	value,
}: {
	key: Buffer | null;
	value: Buffer | null;
}): KafkaMeteringRecord => {
	if (!value) throw new InvalidKafkaMeteringRecordError();

	let input: unknown;
	try {
		input = JSON.parse(value.toString("utf8"));
	} catch (cause) {
		throw new InvalidKafkaMeteringRecordError({ cause });
	}

	const { payload } = parseEnvelope({ input });
	const expectedKey = meteringPartitionKeyOf({
		identity: identityOf({ record: payload }),
	});
	const receivedKey = key?.toString("utf8") ?? null;
	if (receivedKey !== expectedKey) {
		throw new KafkaMeteringRecordKeyMismatchError({
			expectedKey,
			receivedKey,
		});
	}

	return payload;
};

export const parseKafkaTrackOutcomeRecord = ({
	key,
	value,
}: {
	key: Buffer | null;
	value: Buffer | null;
}): TrackOutcome => {
	const record = parseKafkaMeteringRecord({ key, value });
	if (record.type !== "track_outcome") {
		throw new InvalidKafkaMeteringRecordError();
	}
	return record;
};
