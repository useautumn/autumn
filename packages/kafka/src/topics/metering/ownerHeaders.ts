import type { IHeaders } from "kafkajs";
import { InvalidRecordError } from "../../lib/recordErrors.js";
import { OWNER_EPOCH_HEADER } from "../../producer/sendIdempotentBatch.js";
import { OWNER_FENCE_HEADER } from "../../producer/sendOwnerFence.js";

export type OwnerHeaders = {
	ownerEpoch?: bigint;
	fence: boolean;
};

const DECIMAL_EPOCH = /^\d+$/;

function headerText(value: IHeaders[string]): string | undefined {
	const single = Array.isArray(value) ? value[0] : value;
	if (single === undefined) return undefined;
	return typeof single === "string" ? single : single.toString("utf8");
}

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
