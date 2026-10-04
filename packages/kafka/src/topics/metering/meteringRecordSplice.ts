/**
 * A metering record split around its `command`: the decide's own fields are encoded on the sequencer,
 * the command travels as the bytes the request already carried, and the Kafka thread joins the two.
 * `assembleRecord({ decisionBytes: encodeDecision({ record }), commandBytes })` is byte-identical to
 * `serializeMeteringRecord({ record })` whenever `commandBytes` equals `JSON.stringify(record.command)`,
 * which holds for a command that arrived as canonical JSON (the worker client's own `JSON.stringify`).
 *
 * Decision bytes: `[u16 keyLen][u32 headLen][key][head][tail]`, little-endian; `head` ends with
 * `"command":` and `tail` starts with `,` (or `}` when the command is the record's last key).
 */
import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import { InvalidRecordError } from "../../lib/recordErrors.js";
import type { MeteringRecord } from "./types/meteringRecord.js";

const DECISION_HEADER = 6;
const ENVELOPE_HEAD = '{"schemaVersion":1,"type":"mutation","payload":';
const encoder = new TextEncoder();

/** The envelope around a metering payload, for a writer that lays the three pieces down itself. */
export const METERING_ENVELOPE = { head: ENVELOPE_HEAD, tail: "}" } as const;

/** The payload JSON `serializeMeteringRecord` wraps in the envelope. */
export function meteringPayloadJson({
	record,
}: {
	record: MeteringRecord;
}): string {
	if (record.type !== "mutation") throw new InvalidRecordError();
	return JSON.stringify(record);
}

export type SplitMeteringRecord = { key: string; head: string; tail: string };

/** The record's value as `serializeMeteringRecord` encodes it, as text and without its per-object cache. */
export function meteringRecordJson({
	record,
}: {
	record: MeteringRecord;
}): string {
	return `${ENVELOPE_HEAD}${meteringPayloadJson({ record })}}`;
}

/** The key and the record's JSON on each side of its command, as strings. */
export function splitMeteringRecord({
	record,
	partitionKey,
}: {
	record: MeteringRecord;
	/** Skips re-deriving the key when the caller already holds `meteringIdentityToPartitionKey(identity)`. */
	partitionKey?: string;
}): SplitMeteringRecord {
	if (record.type !== "mutation" || record.command === undefined)
		throw new InvalidRecordError();
	const before: Record<string, unknown> = {};
	const after: Record<string, unknown> = {};
	let seenCommand = false;
	for (const field in record) {
		if (field === "command") {
			seenCommand = true;
			continue;
		}
		(seenCommand ? after : before)[field] =
			record[field as keyof MeteringRecord];
	}
	const beforeJson = JSON.stringify(before);
	const afterJson = JSON.stringify(after);
	return {
		key:
			partitionKey ??
			meteringIdentityToPartitionKey({ identity: record.identity }),
		head:
			beforeJson === "{}"
				? `${ENVELOPE_HEAD}{"command":`
				: `${ENVELOPE_HEAD}${beforeJson.slice(0, -1)},"command":`,
		tail: afterJson === "{}" ? "}}" : `,${afterJson.slice(1)}}`,
	};
}

/** Room `encodeDecisionInto` may need for a split (UTF-8 can take three bytes per UTF-16 unit). */
export function maxDecisionBytes({
	split,
}: {
	split: SplitMeteringRecord;
}): number {
	return (
		DECISION_HEADER +
		3 * (split.key.length + split.head.length + split.tail.length)
	);
}

/** Writes the decision bytes at `offset`; `target` must hold `maxDecisionBytes` from there. Returns the length. */
export function encodeDecisionInto({
	split,
	target,
	offset,
}: {
	split: SplitMeteringRecord;
	target: Uint8Array;
	offset: number;
}): number {
	let at = offset + DECISION_HEADER;
	const keyLength = encoder.encodeInto(split.key, target.subarray(at)).written;
	at += keyLength;
	const headLength = encoder.encodeInto(
		split.head,
		target.subarray(at),
	).written;
	at += headLength;
	at += encoder.encodeInto(split.tail, target.subarray(at)).written;
	target[offset] = keyLength & 0xff;
	target[offset + 1] = keyLength >>> 8;
	target[offset + 2] = headLength & 0xff;
	target[offset + 3] = (headLength >>> 8) & 0xff;
	target[offset + 4] = (headLength >>> 16) & 0xff;
	target[offset + 5] = headLength >>> 24;
	return at - offset;
}

/** The decision bytes of one record in their own buffer. */
export function encodeDecision({
	record,
	partitionKey,
}: {
	record: MeteringRecord;
	partitionKey?: string;
}): Uint8Array {
	const split = splitMeteringRecord({ record, partitionKey });
	const target = new Uint8Array(maxDecisionBytes({ split }));
	const length = encodeDecisionInto({ split, target, offset: 0 });
	return target.subarray(0, length);
}

/** Joins a decision with its command's bytes into the record `serializeMeteringRecord` would give. */
export function assembleRecord({
	decisionBytes,
	commandBytes,
}: {
	decisionBytes: Uint8Array;
	commandBytes: Uint8Array;
}): { key: Buffer; value: Buffer } {
	const keyLength =
		(decisionBytes[0] as number) | ((decisionBytes[1] as number) << 8);
	const headLength =
		((decisionBytes[2] as number) |
			((decisionBytes[3] as number) << 8) |
			((decisionBytes[4] as number) << 16) |
			((decisionBytes[5] as number) << 24)) >>>
		0;
	const headAt = DECISION_HEADER + keyLength;
	const tailAt = headAt + headLength;
	const value = Buffer.allocUnsafe(
		decisionBytes.length - headAt + commandBytes.length,
	);
	value.set(decisionBytes.subarray(headAt, tailAt), 0);
	value.set(commandBytes, headLength);
	value.set(decisionBytes.subarray(tailAt), headLength + commandBytes.length);
	return {
		key: Buffer.from(decisionBytes.subarray(DECISION_HEADER, headAt)),
		value,
	};
}
