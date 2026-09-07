import {
	type MeteringIdentity,
	meteringPartitionKeyOf,
} from "@autumn/balance-engine";

// Kafka Java / KafkaJS DefaultPartitioner murmur2, then toPositive % count.
function murmur2({ data }: { data: Buffer }): number {
	const seed = 0x9747b28c;
	const m = 0x5bd1e995;
	const r = 24;
	let h = (seed ^ data.length) | 0;
	const length4 = data.length >> 2;

	for (let i = 0; i < length4; i++) {
		const i4 = i << 2;
		let k =
			(data[i4] & 0xff) |
			((data[i4 + 1] & 0xff) << 8) |
			((data[i4 + 2] & 0xff) << 16) |
			((data[i4 + 3] & 0xff) << 24);
		k = Math.imul(k, m);
		k ^= k >>> r;
		k = Math.imul(k, m);
		h = Math.imul(h, m) ^ k;
	}

	const remainder = data.length % 4;
	const tail = data.length & ~3;
	if (remainder >= 3) h ^= (data[tail + 2] & 0xff) << 16;
	if (remainder >= 2) h ^= (data[tail + 1] & 0xff) << 8;
	if (remainder >= 1) {
		h ^= data[tail] & 0xff;
		h = Math.imul(h, m);
	}

	h ^= h >>> 13;
	h = Math.imul(h, m);
	h ^= h >>> 15;
	return h | 0;
}

export function meteringIdentityToPartition({
	identity,
	partitionCount,
}: {
	identity: MeteringIdentity;
	partitionCount: number;
}): number {
	if (!Number.isSafeInteger(partitionCount) || partitionCount <= 0) {
		throw new RangeError(
			`partitionCount must be a positive safe integer: ${partitionCount}`,
		);
	}

	const key = Buffer.from(meteringPartitionKeyOf({ identity }), "utf8");
	return (murmur2({ data: key }) & 0x7fffffff) % partitionCount;
}
