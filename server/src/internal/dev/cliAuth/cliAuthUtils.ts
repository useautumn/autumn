import * as crypto from "node:crypto";

/**
 * Generates a cryptographically secure 6-digit OTP
 */
export const generateOtp = (): string => {
	const getRandomInt = (): number => {
		if (
			typeof crypto !== "undefined" &&
			typeof crypto.getRandomValues === "function"
		) {
			const array = new Uint32Array(1);
			crypto.getRandomValues(array);
			return array[0];
		}

		// Node.js (SSR / tests) – use crypto module's webcrypto if available
		try {
			const { webcrypto } = require("node:crypto");
			if (webcrypto?.getRandomValues) {
				const arr = new Uint32Array(1);
				webcrypto.getRandomValues(arr);
				return arr[0];
			}
		} catch (_) {
			/* ignore */
		}

		// Fallback (non-cryptographic)
		return Math.floor(Math.random() * 0xffffffff);
	};

	// Limit to range [100000, 999999]
	const randomSixDigits = (getRandomInt() % 900000) + 100000;
	return randomSixDigits.toString();
};

/**
 * Generates a random hex key of the specified length
 */
export const generateRandomKey = (lengthInBytes: number = 32): string => {
	if (lengthInBytes <= 0) {
		throw new Error("Key length must be a positive number.");
	}
	return crypto.randomBytes(lengthInBytes).toString("hex");
};

export const OTP_TTL = 300;
