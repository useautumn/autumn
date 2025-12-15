/**
 * Decoded cursor with verbose property names for code readability
 */
export interface DecodedCursorV1 {
	timestamp: number;
	id: string;
}

/**
 * Encodes cursor into compact base64url string
 * Format: version|timestamp|id (e.g., "1|1764746499167|evt_xxx")
 * Uses pipe-delimited format for optimal performance and 25% size reduction vs JSON
 * Uses base64url encoding for URL safety
 */
export const encodeCursor = ({
	timestamp,
	id,
}: {
	timestamp: number;
	id: string;
}): string => {
	const raw = `1|${timestamp}|${id}`;
	return Buffer.from(raw).toString("base64url");
};

/**
 * Decodes base64url cursor string to extract timestamp and ID
 * Expects format: version|timestamp|id
 * @throws Error if cursor format is invalid
 */
export const decodeCursor = (cursorStr: string): DecodedCursorV1 => {
	try {
		const decoded = Buffer.from(cursorStr, "base64url").toString();
		const parts = decoded.split("|");

		if (parts.length !== 3) {
			throw new Error("Invalid cursor structure");
		}

		const [version, timestamp, id] = parts;

		if (version !== "1" || !id || !timestamp) {
			throw new Error("Invalid cursor structure");
		}

		const parsedTimestamp = Number.parseInt(timestamp, 10);
		if (Number.isNaN(parsedTimestamp)) {
			throw new Error("Invalid cursor timestamp");
		}

		return {
			timestamp: parsedTimestamp,
			id,
		};
	} catch (_error) {
		throw new Error("Invalid cursor format");
	}
};
