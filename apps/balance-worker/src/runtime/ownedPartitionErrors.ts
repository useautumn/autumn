export type OwnedPartitionRuntimeStatus =
	| "created"
	| "starting"
	| "ready"
	| "draining"
	| "stopped"
	| "recovery_required";

export class OwnedPartitionNotReadyError extends Error {
	readonly status: OwnedPartitionRuntimeStatus;

	constructor({ status }: { status: OwnedPartitionRuntimeStatus }) {
		super(`Owned partition runtime is not ready: ${status}`);
		this.name = "OwnedPartitionNotReadyError";
		this.status = status;
	}
}

export class OwnedPartitionMismatchError extends Error {
	constructor({
		customerKey,
		expectedPartition,
		actualPartition,
	}: {
		customerKey: string;
		expectedPartition: number;
		actualPartition: number;
	}) {
		super(
			`${customerKey} does not belong to owned partition ${expectedPartition}; resolved to ${actualPartition}`,
		);
		this.name = "OwnedPartitionMismatchError";
	}
}

export class OwnedPartitionStateNotFoundError extends Error {
	constructor({ customerKey }: { customerKey: string }) {
		super(`Owned partition state not found: ${customerKey}`);
		this.name = "OwnedPartitionStateNotFoundError";
	}
}

export class OwnedPartitionRecoveryRequiredError extends Error {
	constructor({
		topic,
		partition,
		cause,
	}: {
		topic: string;
		partition: number;
		cause: unknown;
	}) {
		super(`Owned partition ${topic}[${partition}] requires recovery`, {
			cause,
		});
		this.name = "OwnedPartitionRecoveryRequiredError";
	}
}

export class OwnedPartitionProducerFencedError extends OwnedPartitionRecoveryRequiredError {
	constructor({
		topic,
		partition,
		cause,
	}: {
		topic: string;
		partition: number;
		cause: unknown;
	}) {
		super({ topic, partition, cause });
		this.name = "OwnedPartitionProducerFencedError";
		this.message = `Owned partition producer ${topic}[${partition}] was fenced`;
	}
}

type KafkaErrorMetadata = {
	type?: unknown;
	code?: unknown;
	cause?: unknown;
	abortCause?: unknown;
	errors?: unknown;
};

const kafkaFencingErrorTypes = new Set([
	"INVALID_PRODUCER_EPOCH",
	"INVALID_PRODUCER_ID_MAPPING",
	"PRODUCER_FENCED",
]);
const kafkaFencingErrorCodes = new Set([47, 49, 90]);

export const isKafkaProducerFencingCause = ({
	cause,
}: {
	cause: unknown;
}): boolean => {
	const pendingCauses = [cause];
	const visitedCauses = new Set<unknown>();

	while (pendingCauses.length > 0) {
		const currentCause = pendingCauses.pop();
		if (
			currentCause === null ||
			typeof currentCause !== "object" ||
			visitedCauses.has(currentCause)
		) {
			continue;
		}
		visitedCauses.add(currentCause);
		const metadata = currentCause as KafkaErrorMetadata;
		if (
			(typeof metadata.type === "string" &&
				kafkaFencingErrorTypes.has(metadata.type)) ||
			(typeof metadata.code === "number" &&
				kafkaFencingErrorCodes.has(metadata.code))
		) {
			return true;
		}
		pendingCauses.push(metadata.cause, metadata.abortCause);
		if (Array.isArray(metadata.errors)) {
			pendingCauses.push(...metadata.errors);
		}
	}

	return false;
};

export const createOwnedPartitionRecoveryError = ({
	topic,
	partition,
	cause,
}: {
	topic: string;
	partition: number;
	cause: unknown;
}): OwnedPartitionRecoveryRequiredError =>
	isKafkaProducerFencingCause({ cause })
		? new OwnedPartitionProducerFencedError({ topic, partition, cause })
		: new OwnedPartitionRecoveryRequiredError({ topic, partition, cause });
