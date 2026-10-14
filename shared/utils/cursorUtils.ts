export interface DecodedCursorV1 {
	timestamp: number;
	id: string;
}

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
