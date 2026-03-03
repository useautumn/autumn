import { base62Encode } from "./base62";
import { getRandomBytes } from "./random";

/**
 * KSUID epoch: 2014-05-13T16:53:20Z (1400000000 seconds after Unix epoch)
 * Matches the original Segment KSUID spec.
 */
const KSUID_EPOCH = 1400000000;

/** 20 bytes total: 4 timestamp + 16 random */
const PAYLOAD_BYTES = 20;

/** Base62 encoding of 20 bytes = 27 characters */
const ENCODED_LENGTH = 27;

/**
 * Generate a KSUID string with an optional prefix.
 *
 * Format: `{prefix}{base62(timestamp + random)}`
 * - 4 bytes: seconds since KSUID epoch (sortable)
 * - 16 bytes: cryptographically random payload
 * - base62 encoded, zero-padded to 27 chars
 */
export const generateKsuid = ({ prefix = "" }: { prefix?: string } = {}): string => {
	const payload = new Uint8Array(PAYLOAD_BYTES);

	// Write 4-byte big-endian timestamp
	const timestamp = Math.floor(Date.now() / 1000) - KSUID_EPOCH;
	payload[0] = (timestamp >>> 24) & 0xff;
	payload[1] = (timestamp >>> 16) & 0xff;
	payload[2] = (timestamp >>> 8) & 0xff;
	payload[3] = timestamp & 0xff;

	// Fill remaining 16 bytes with crypto random
	const randomBytes = getRandomBytes({ size: 16 });
	payload.set(randomBytes, 4);

	const encoded = base62Encode({ bytes: payload, padTo: ENCODED_LENGTH });
	return `${prefix}${encoded}`;
};
