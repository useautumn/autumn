import type { KafkaTokenInfo } from "./mskTokenInfo.js";

export type KafkaTokenRecord = {
	record(params: { info: KafkaTokenInfo; at: number }): void;
	read(): { info: KafkaTokenInfo; at: number; count: number } | null;
};

export type KafkaTokenState = KafkaTokenInfo & {
	secondsSinceSigned: number;
	expired: boolean;
	tokensSigned: number;
};

export function createKafkaTokenRecord(): KafkaTokenRecord {
	let last: { info: KafkaTokenInfo; at: number } | null = null;
	let count = 0;
	function record({ info, at }: { info: KafkaTokenInfo; at: number }): void {
		last = { info, at };
		count += 1;
	}
	function read(): ReturnType<KafkaTokenRecord["read"]> {
		return last ? { ...last, count } : null;
	}
	return { record, read };
}

export const processKafkaTokens = createKafkaTokenRecord();

export function describeKafkaToken({
	record,
	now,
}: {
	record: KafkaTokenRecord;
	now: number;
}): KafkaTokenState | null {
	const last = record.read();
	if (!last) return null;
	return {
		...last.info,
		secondsSinceSigned: Math.round((now - last.at) / 1000),
		expired: now >= Date.parse(last.info.expiresAt),
		tokensSigned: last.count,
	};
}

export function describeProcessKafkaToken(): KafkaTokenState | null {
	return describeKafkaToken({ record: processKafkaTokens, now: Date.now() });
}

export function writeKafkaTokenLine(info: KafkaTokenInfo): void {
	console.info(
		JSON.stringify({
			level: "INFO",
			event: "kafka.token_signed",
			message: `[KafkaToken] Signed with key …${info.keyIdSuffix ?? "?"}; expires ${info.expiresAt}`,
			kafkaToken: info,
		}),
	);
}
