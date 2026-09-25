import type { IHeaders } from "kafkajs";
import { InvalidRecordError } from "../../lib/recordErrors.js";
import { OWNER_EPOCH_HEADER } from "../../producer/sendIdempotentBatch.js";
import { OWNER_FENCE_HEADER } from "../../producer/sendOwnerFence.js";

/** What a metering record's headers say about who wrote it. */
export type OwnerHeaders = {
	/** Absent on records written under a transaction, where the broker did the fencing. */
	ownerEpoch?: bigint;
	/** True for an ownership fence marker, which carries no mutation. */
	fence: boolean;
};

const DECIMAL_EPOCH = /^\d+$/;

function headerText(value: IHeaders[string]): string | undefined {
	const single = Array.isArray(value) ? value[0] : value;
	if (single === undefined) return undefined;
	return typeof single === "string" ? single : single.toString("utf8");
}

/** A header that does not parse is a broken record: its partition is parked, never guessed at. */
export function readOwnerHeaders({
	headers,
}: {
	headers?: IHeaders;
}): OwnerHeaders {
	if (!headers) return { fence: false };
	const epochText = headerText(headers[OWNER_EPOCH_HEADER]);
	const fence = headerText(headers[OWNER_FENCE_HEADER]) !== undefined;
	if (epochText === undefined) {
		if (fence)
			throw new InvalidRecordError({
				cause: new Error("Ownership fence carries no owner epoch"),
			});
		return { fence };
	}
	if (!DECIMAL_EPOCH.test(epochText)) {
		throw new InvalidRecordError({
			cause: new Error(`Invalid owner epoch header: ${epochText}`),
		});
	}
	return { ownerEpoch: BigInt(epochText), fence };
}
