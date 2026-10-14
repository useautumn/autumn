interface RawEvent {
	timestamp: string;
	event_name: string;
	value: number;
	properties: Record<string, unknown> | string;
}

const EXCLUDED_PROPERTIES = new Set(["value"]);

const MAX_EVENTS_TO_SCAN = 1000;

export function extractPropertyKeys({
	rawEvents,
}: {
	rawEvents: RawEvent[] | undefined;
}): string[] {
	if (!rawEvents || rawEvents.length === 0) {
		return [];
	}

	const propertyKeys = new Set<string>();
	const eventsToScan = rawEvents.slice(0, MAX_EVENTS_TO_SCAN);

	for (const event of eventsToScan) {
		const properties = parseProperties(event.properties);
		if (!properties) continue;

		for (const key of Object.keys(properties)) {
			if (!EXCLUDED_PROPERTIES.has(key)) {
				propertyKeys.add(key);
			}
		}
	}

	return Array.from(propertyKeys).sort();
}

function parseProperties(
	properties: Record<string, unknown> | string | undefined,
): Record<string, unknown> | null {
	if (!properties) return null;

	if (typeof properties === "string") {
		try {
			return JSON.parse(properties);
		} catch {
			return null;
		}
	}

	return properties;
}
