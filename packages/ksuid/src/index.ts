import { base62Encode } from "./base62";
import { getRandomBytes } from "./random";

const KSUID_EPOCH = 1400000000;

const PAYLOAD_BYTES = 20;

const ENCODED_LENGTH = 27;

export const generateKsuid = ({ prefix = "" }: { prefix?: string } = {}): string => {
	const payload = new Uint8Array(PAYLOAD_BYTES);

	const timestamp = Math.floor(Date.now() / 1000) - KSUID_EPOCH;
	payload[0] = (timestamp >>> 24) & 0xff;
	payload[1] = (timestamp >>> 16) & 0xff;
	payload[2] = (timestamp >>> 8) & 0xff;
	payload[3] = timestamp & 0xff;

	const randomBytes = getRandomBytes({ size: 16 });
	payload.set(randomBytes, 4);

	const encoded = base62Encode({ bytes: payload, padTo: ENCODED_LENGTH });
	return `${prefix}${encoded}`;
};
