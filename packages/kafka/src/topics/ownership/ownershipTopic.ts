import { InvalidRecordError } from "../../lib/recordErrors.js";
import {
	assertTopicRecordKey,
	readTopicEnvelope,
	serializeTopicRecord,
} from "../../lib/topicEnvelope.js";
import type {
	TopicRecordEnvelope,
	TopicSchema,
} from "../../lib/types/topicSchema.js";
import {
	claimedOwnershipRecordSchema,
	drainingOwnershipRecordSchema,
	type OwnershipRecord,
	readyOwnershipRecordSchema,
	unownedOwnershipRecordSchema,
} from "./types/ownershipRecord.js";

function parseClaimed({
	input,
}: {
	input: unknown;
}): Extract<OwnershipRecord, { type: "claimed" }> {
	const parsed = claimedOwnershipRecordSchema.safeParse(input);
	if (!parsed.success) throw new InvalidRecordError({ cause: parsed.error });
	return parsed.data;
}

function parseUnowned({
	input,
}: {
	input: unknown;
}): Extract<OwnershipRecord, { type: "unowned" }> {
	const parsed = unownedOwnershipRecordSchema.safeParse(input);
	if (!parsed.success) throw new InvalidRecordError({ cause: parsed.error });
	return parsed.data;
}

function parseReady({
	input,
}: {
	input: unknown;
}): Extract<OwnershipRecord, { type: "ready" }> {
	const parsed = readyOwnershipRecordSchema.safeParse(input);
	if (!parsed.success) throw new InvalidRecordError({ cause: parsed.error });
	return parsed.data;
}

/** Key scheme on a compacted topic: `claimed` and `unowned` share the
 *  partition's key, so compaction keeps only the latest word on who owns it.
 *  A handoff signal (`ready`, `draining`) is keyed `<partition>:<type>` so it only
 *  ever compacts against its own kind; under the owner's key it would replace
 *  the current `claimed` once a segment rolled, and a cold-starting owner
 *  table would see no owner while the predecessor was still serving. */
function parseDraining({
	input,
}: {
	input: unknown;
}): Extract<OwnershipRecord, { type: "draining" }> {
	const parsed = drainingOwnershipRecordSchema.safeParse(input);
	if (!parsed.success) throw new InvalidRecordError({ cause: parsed.error });
	return parsed.data;
}

function ownershipRecordToKey({ record }: { record: OwnershipRecord }): string {
	if (record.type === "claimed" || record.type === "unowned")
		return record.partition.toString();
	return `${record.partition}:${record.type}`;
}

function parseOwnershipPayload({
	type,
	payload,
}: Pick<TopicRecordEnvelope, "type" | "payload">): OwnershipRecord {
	switch (type) {
		case "claimed":
			return parseClaimed({ input: payload });
		case "unowned":
			return parseUnowned({ input: payload });
		case "ready":
			return parseReady({ input: payload });
		case "draining":
			return parseDraining({ input: payload });
		default:
			throw new InvalidRecordError();
	}
}

const OWNERSHIP_RECORD_TYPES = new Set<OwnershipRecord["type"]>([
	"claimed",
	"unowned",
	"ready",
	"draining",
]);

/** The first `ready` records were keyed like the owner; they still read, they are just never written. */
function isLegacyReadyKey({
	key,
	record,
}: {
	key: Buffer | null;
	record: OwnershipRecord;
}): boolean {
	return (
		record.type === "ready" &&
		key?.toString("utf8") === record.partition.toString()
	);
}

function parseOwnershipRecord({
	key,
	value,
}: {
	key: Buffer | null;
	value: Buffer | null;
}): OwnershipRecord {
	const record = parseOwnershipPayload(readTopicEnvelope({ value }));
	if (isLegacyReadyKey({ key, record })) return record;
	assertTopicRecordKey({ key, expectedKey: ownershipRecordToKey({ record }) });
	return record;
}

/** For the owner table: a record type this build does not know is a signal for
 *  someone else, not a reason to stop routing. Malformed known types still throw. */
export function parseOwnershipRecordIfKnown({
	key,
	value,
}: {
	key: Buffer | null;
	value: Buffer | null;
}): OwnershipRecord | null {
	const envelope = readTopicEnvelope({ value });
	if (!OWNERSHIP_RECORD_TYPES.has(envelope.type as OwnershipRecord["type"]))
		return null;
	return parseOwnershipRecord({ key, value });
}

function serializeOwnershipRecord({ record }: { record: OwnershipRecord }): {
	key: Buffer;
	value: Buffer;
} {
	const payload = parseOwnershipPayload({ type: record.type, payload: record });
	return serializeTopicRecord({
		key: ownershipRecordToKey({ record: payload }),
		record: payload,
	});
}

export const ownershipTopic: TopicSchema<OwnershipRecord> = {
	keyOf: ownershipRecordToKey,
	parse: parseOwnershipRecord,
	serialize: serializeOwnershipRecord,
};
