/**
 * Raw event structure from the analytics API
 */
interface RawEvent {
	timestamp: string;
	event_name: string;
	value: number;
	properties: Record<string, unknown> | string;
}

/**
 * Internal properties to exclude from the group by dropdown
 */
const EXCLUDED_PROPERTIES = new Set(["value"]);

/**
 * Maximum number of events to scan for property keys
 */
const MAX_EVENTS_TO_SCAN = 1000;

/**
 * Extracts unique property keys from raw events for use in group by dropdown.
 * Scans up to 1000 events and filters out internal properties.
 */
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

/**
 * Parses properties which may be a string (JSON) or already an object
 */
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

