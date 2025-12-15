/**
 * Compound cursor (v1)
 * Uses timestamp + id for stable sorting and efficient pagination
 */
export interface CursorV1 {
	v: 1;
	timestamp: number;
	id: string;
}

/**
 * Decoded cursor (v1)
 * Uses timestamp and id for stable sorting and efficient pagination
 */
export interface DecodedCursorV1 {
	timestamp: number;
	id: string;
}

/**
 * Encodes cursor into opaque base64 string
 */
export const encodeCursor = ({
	timestamp,
	id,
}: {
	timestamp: number;
	id: string;
}): string => {
	const cursor: CursorV1 = { v: 1, timestamp, id };
	return Buffer.from(JSON.stringify(cursor)).toString("base64");
};

/**
 * Decodes base64 cursor string to extract timestamp and ID
 * @throws Error if cursor format is invalid
 */
export const decodeCursor = (cursorStr: string): DecodedCursorV1 => {
	try {
		const decoded = JSON.parse(
			Buffer.from(cursorStr, "base64").toString(),
		) as CursorV1;

		if (
			decoded.v !== 1 ||
			!decoded.id ||
			typeof decoded.id !== "string" ||
			typeof decoded.timestamp !== "number"
		) {
			throw new Error("Invalid cursor structure");
		}

		return {
			timestamp: decoded.timestamp,
			id: decoded.id,
		};
	} catch (_error) {
		throw new Error("Invalid cursor format");
	}
};
