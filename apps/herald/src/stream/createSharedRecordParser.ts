import { type MeteringRecord, parseTrustedMeteringRecord } from "@autumn/kafka";

export type SharedRecordParser = (params: {
	position: { topic: string; partition: number; offset: bigint };
	key: Buffer | null;
	value: Buffer | null;
}) => MeteringRecord;

/** Herald trusts the log it follows: the writer validated each record, so only the shape readers lean on is checked. */
export function createSharedRecordParser(): SharedRecordParser {
	return ({ key, value }) => parseTrustedMeteringRecord({ key, value });
}
