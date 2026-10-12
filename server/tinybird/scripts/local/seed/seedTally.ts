import type { SeedEvent } from "./generateEvent.js";
import type { SeedOptions } from "./seedOptions.js";

export type SeedTally = {
	events: number;
	value: number;
	byFeature: Map<string, number>;
	byCustomer: Map<string, number>;
	entityEvents: number;
	entities: Set<string>;
	propertyPresent: Map<string, number>;
	propertyValues: Map<string, Set<string>>;
	minTs: string;
	maxTs: string;
};

const DISTINCT_TRACKED = new Set(["region", "model", "path"]);

export const createSeedTally = (): SeedTally => ({
	events: 0,
	value: 0,
	byFeature: new Map(),
	byCustomer: new Map(),
	entityEvents: 0,
	entities: new Set(),
	propertyPresent: new Map(),
	propertyValues: new Map(),
	minTs: "",
	maxTs: "",
});

const bump = (map: Map<string, number>, key: string, by = 1) =>
	map.set(key, (map.get(key) ?? 0) + by);

export const tallyEvent = ({
	tally,
	event,
}: {
	tally: SeedTally;
	event: SeedEvent;
}) => {
	tally.events++;
	tally.value += event.value ?? 1;
	bump(tally.byFeature, event.event_name);
	bump(tally.byCustomer, event.customer_id);
	if (event.entity_id) {
		tally.entityEvents++;
		tally.entities.add(event.entity_id);
	}
	for (const [key, value] of Object.entries(event.properties)) {
		bump(tally.propertyPresent, key);
		if (!DISTINCT_TRACKED.has(key)) continue;
		if (!tally.propertyValues.has(key))
			tally.propertyValues.set(key, new Set());
		tally.propertyValues.get(key)?.add(value);
	}
	if (!tally.minTs || event.timestamp < tally.minTs)
		tally.minTs = event.timestamp;
	if (event.timestamp > tally.maxTs) tally.maxTs = event.timestamp;
};

export const printSeedTally = ({
	tally,
	options,
	runKey,
	batches,
}: {
	tally: SeedTally;
	options: SeedOptions;
	runKey: string;
	batches: number;
}) => {
	const top = [...tally.byCustomer.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5);
	const topShare =
		top.reduce((sum, [, c]) => sum + c, 0) / Math.max(1, tally.events);
	const lines = [
		`\nseed summary (run ${runKey}, seed ${options.seed}, presets ${options.presets.join("+")})`,
		`  org/env        ${options.orgId}/${options.env}`,
		`  events         ${tally.events.toLocaleString()} (regular ${options.events.toLocaleString()}, live-hour ${options.liveHourEvents}, half-hour-tz ${options.halfHourEvents})`,
		`  time range     ${tally.minTs} .. ${tally.maxTs} UTC (--end ${options.end.toISOString()})`,
		`  total value    ${tally.value}`,
		`  features       ${[...tally.byFeature.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}`,
		`  customers      ${tally.byCustomer.size.toLocaleString()} distinct; top 5 hold ${(topShare * 100).toFixed(1)}%: ${top.map(([k, v]) => `${k} ${v}`).join(", ")}`,
		`  entities       ${tally.entityEvents.toLocaleString()} events across ${tally.entities.size.toLocaleString()} entity ids`,
		`  properties     ${[...tally.propertyPresent.entries()].map(([k, v]) => `${k} ${v}${tally.propertyValues.has(k) ? ` (${tally.propertyValues.get(k)?.size} values)` : ""}`).join(", ")}`,
		`  inserts        ${batches} (batch ${options.batchSize}; last ${options.smallBatchEvents} events in batches of ${options.smallBatchSize})`,
	];
	console.log(lines.join("\n"));
};
