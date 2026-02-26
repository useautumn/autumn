const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Encode a Uint8Array as a base62 string, zero-padded to `padTo` length.
 * Uses big-integer division over the byte array.
 */
export const base62Encode = ({
	bytes,
	padTo,
}: {
	bytes: Uint8Array;
	padTo: number;
}): string => {
	const digits: number[] = [];

	// Convert byte array to base62 via repeated divmod
	// Work on a copy so we don't mutate the input
	const working = new Uint8Array(bytes);

	let allZero = false;
	while (!allZero) {
		allZero = true;
		let remainder = 0;
		for (let i = 0; i < working.length; i++) {
			const accumulator = remainder * 256 + working[i];
			working[i] = Math.floor(accumulator / 62);
			remainder = accumulator % 62;
			if (working[i] !== 0) allZero = false;
		}
		digits.push(remainder);
	}

	// digits are in reverse order
	digits.reverse();

	// Pad with leading zeros
	while (digits.length < padTo) {
		digits.unshift(0);
	}

	return digits.map((d) => ALPHABET[d]).join("");
};
