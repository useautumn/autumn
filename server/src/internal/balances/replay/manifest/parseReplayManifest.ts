import { z } from "zod/v4";
import {
	REPLAY_BODY_CUSTOMER_ID_FIELD,
	REPLAY_BODY_TIMESTAMP_FIELD,
	type ReplayArchiveProvenance,
	type ReplayManifest,
	type ReplayManifestBaseline,
	ReplayManifestError,
	type ReplayManifestRequest,
	type ReplayManifestWindow,
	type ReplayRequestBody,
	type ReplayValidationIssue,
} from "./replayManifestContracts.js";

const nonEmptyTextSchema = z.string().min(1);

const epochMillisecondsSchema = z.number().int().nonnegative();

const replayRequestBodySchema = z.record(z.string(), z.unknown());

const replayManifestBaselineSchema = z.strictObject({
	id: nonEmptyTextSchema,
	capturedAtMs: epochMillisecondsSchema,
});

const replayManifestWindowSchema = z.strictObject({
	startMs: epochMillisecondsSchema,
	endMs: epochMillisecondsSchema,
});

const replayRequestEnvelopeSchema = z.strictObject({
	id: nonEmptyTextSchema,
	archivedAtMs: epochMillisecondsSchema,
	orgId: nonEmptyTextSchema,
	env: z.enum(["live", "sandbox"]),
	customerId: nonEmptyTextSchema,
	operation: z.enum(["track", "check"]),
	body: replayRequestBodySchema,
});

const replayManifestInputSchema = z.strictObject({
	baseline: replayManifestBaselineSchema,
	window: replayManifestWindowSchema,
	requests: z.array(replayRequestEnvelopeSchema),
});

type ReplayRequestEnvelope = z.infer<typeof replayRequestEnvelopeSchema>;

type ReplayManifestInput = z.infer<typeof replayManifestInputSchema>;

const describeManifestIssues = ({
	issues,
}: {
	issues: readonly ReplayValidationIssue[];
}): string => {
	const descriptions: string[] = [];
	for (const issue of issues) {
		const path = issue.path.map(String).join(".");
		descriptions.push(
			path.length > 0 ? `${path}: ${issue.message}` : issue.message,
		);
	}
	return descriptions.join("; ");
};

const parseManifestInput = ({
	input,
}: {
	input: unknown;
}): ReplayManifestInput => {
	const result = replayManifestInputSchema.safeParse(input);
	if (!result.success) {
		throw new ReplayManifestError({
			message: `invalid replay manifest: ${describeManifestIssues({
				issues: result.error.issues,
			})}`,
		});
	}
	return result.data;
};

const assertOrderedWindow = ({
	window,
}: {
	window: ReplayManifestWindow;
}): void => {
	if (window.endMs < window.startMs) {
		throw new ReplayManifestError({
			message:
				"invalid replay manifest: the archive window ends before it starts",
		});
	}
};

const assertUniqueRequestIds = ({
	envelopes,
}: {
	envelopes: readonly ReplayRequestEnvelope[];
}): void => {
	const seenIds = new Set<string>();
	for (const envelope of envelopes) {
		if (seenIds.has(envelope.id)) {
			throw new ReplayManifestError({
				message: `invalid replay manifest: duplicate replay request id "${envelope.id}"`,
			});
		}
		seenIds.add(envelope.id);
	}
};

const resolveLogicalRunEndMs = ({
	baseline,
	window,
}: {
	baseline: ReplayManifestBaseline;
	window: ReplayManifestWindow;
}): number => {
	const logicalRunEndMs =
		baseline.capturedAtMs + (window.endMs - window.startMs);
	if (!Number.isSafeInteger(logicalRunEndMs)) {
		throw new ReplayManifestError({
			message:
				"invalid replay manifest: the rebased run end leaves the safe integer range",
		});
	}
	return logicalRunEndMs;
};

const assertArchivedWithinWindow = ({
	envelope,
	window,
}: {
	envelope: ReplayRequestEnvelope;
	window: ReplayManifestWindow;
}): void => {
	const isInsideWindow =
		envelope.archivedAtMs >= window.startMs &&
		envelope.archivedAtMs <= window.endMs;
	if (!isInsideWindow) {
		throw new ReplayManifestError({
			message: `replay request "${envelope.id}" was archived outside the manifest window`,
		});
	}
};

const resolveLogicalTimestampMs = ({
	envelope,
	baseline,
	window,
}: {
	envelope: ReplayRequestEnvelope;
	baseline: ReplayManifestBaseline;
	window: ReplayManifestWindow;
}): number => {
	const logicalTimestampMs =
		baseline.capturedAtMs + (envelope.archivedAtMs - window.startMs);
	if (!Number.isSafeInteger(logicalTimestampMs)) {
		throw new ReplayManifestError({
			message: `replay request "${envelope.id}" rebases outside the safe integer range`,
		});
	}
	return logicalTimestampMs;
};

const applyEnvelopeCustomerId = ({
	body,
	envelope,
}: {
	body: ReplayRequestBody;
	envelope: ReplayRequestEnvelope;
}): void => {
	if (!(REPLAY_BODY_CUSTOMER_ID_FIELD in body)) {
		body[REPLAY_BODY_CUSTOMER_ID_FIELD] = envelope.customerId;
		return;
	}
	if (body[REPLAY_BODY_CUSTOMER_ID_FIELD] !== envelope.customerId) {
		throw new ReplayManifestError({
			message: `replay request "${envelope.id}" body customer_id does not match the archived envelope customer`,
		});
	}
};

const buildRequestBody = ({
	envelope,
	logicalTimestampMs,
}: {
	envelope: ReplayRequestEnvelope;
	logicalTimestampMs: number;
}): ReplayRequestBody => {
	const body: ReplayRequestBody = structuredClone(envelope.body);
	applyEnvelopeCustomerId({ body, envelope });
	if (envelope.operation === "track") {
		body[REPLAY_BODY_TIMESTAMP_FIELD] = logicalTimestampMs;
	}
	return body;
};

const buildArchiveProvenance = ({
	envelope,
	window,
}: {
	envelope: ReplayRequestEnvelope;
	window: ReplayManifestWindow;
}): ReplayArchiveProvenance =>
	Object.freeze({
		archivedAtMs: envelope.archivedAtMs,
		archiveWindowStartMs: window.startMs,
		archiveWindowEndMs: window.endMs,
	});

const buildManifestRequest = ({
	envelope,
	baseline,
	window,
}: {
	envelope: ReplayRequestEnvelope;
	baseline: ReplayManifestBaseline;
	window: ReplayManifestWindow;
}): ReplayManifestRequest => {
	assertArchivedWithinWindow({ envelope, window });
	const logicalTimestampMs = resolveLogicalTimestampMs({
		envelope,
		baseline,
		window,
	});
	return Object.freeze({
		id: envelope.id,
		orgId: envelope.orgId,
		env: envelope.env,
		customerId: envelope.customerId,
		operation: envelope.operation,
		logicalTimestampMs,
		provenance: buildArchiveProvenance({ envelope, window }),
		body: buildRequestBody({ envelope, logicalTimestampMs }),
	});
};

const buildManifestRequests = ({
	envelopes,
	baseline,
	window,
}: {
	envelopes: readonly ReplayRequestEnvelope[];
	baseline: ReplayManifestBaseline;
	window: ReplayManifestWindow;
}): ReplayManifestRequest[] => {
	const requests: ReplayManifestRequest[] = [];
	for (const envelope of envelopes) {
		requests.push(buildManifestRequest({ envelope, baseline, window }));
	}
	return requests;
};

export const parseReplayManifest = ({
	input,
}: {
	input: unknown;
}): ReplayManifest => {
	const parsed = parseManifestInput({ input });
	assertOrderedWindow({ window: parsed.window });
	assertUniqueRequestIds({ envelopes: parsed.requests });
	const logicalRunEndMs = resolveLogicalRunEndMs({
		baseline: parsed.baseline,
		window: parsed.window,
	});
	const requests = buildManifestRequests({
		envelopes: parsed.requests,
		baseline: parsed.baseline,
		window: parsed.window,
	});
	return Object.freeze({
		baseline: Object.freeze({ ...parsed.baseline }),
		window: Object.freeze({ ...parsed.window }),
		logicalRunEndMs,
		requests: Object.freeze(requests),
	});
};
