import type { SeedOptions } from "./seedOptions.js";

export type SeedEvent = {
	id: string;
	org_id: string;
	env: string;
	timestamp: string;
	event_name: string;
	customer_id: string;
	value: number | null;
	entity_id: string | null;
	internal_product_id: string | null;
	properties: Record<string, string>;
	deductions: Record<string, never>;
};

const HOUR_US = 3_600_000_000;
const DAY_US = 24 * HOUR_US;

const REGIONS = ["us-east", "us-west", "eu-west", "ap-south"];
const MODELS = [
	"gpt-5",
	"gpt-5-mini",
	"claude-sonnet",
	"claude-haiku",
	"gemini-pro",
	"llama-70b",
	"mistral-large",
	"o4",
];
const PRODUCTS = ["prod_seed_pro", "prod_seed_starter", null] as const;
const MIXED_VALUES = [
	0,
	2.5,
	10,
	100,
	-1,
	-7.25,
	0.001,
	1_000_000,
	null,
] as const;
/** UTC instants that land exactly on local-midnight/hour edges in +5:30, +5:45 and -3:30/-2:30 zones. */
const HALF_HOUR_EDGES_US = [
	"18:29:59.999999",
	"18:30:00",
	"18:15:00",
	"02:29:59.999999",
	"02:30:00",
	"03:30:00",
].map((time) => {
	const [h, m, s] = time.split(":").map(Number);
	return Math.round(((h * 60 + m) * 60 + s) * 1_000_000);
});

const fmix32 = (input: number) => {
	let h = input >>> 0;
	h ^= h >>> 16;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 16;
	return h >>> 0;
};

/** Stateless hash RNG: event i's fields depend only on (seed, i), never on batching or order. */
const makeRandom = ({ seed, index }: { seed: number; index: number }) => {
	const base = fmix32(fmix32(seed ^ 0x9e3779b9) ^ index);
	return (stream: number) =>
		fmix32(base ^ fmix32(stream + 0x632be5ab)) / 4_294_967_296;
};

const hex = (
	rand: (stream: number) => number,
	stream: number,
	length: number,
) => {
	let out = "";
	for (let i = 0; out.length < length; i++) {
		out += Math.floor(rand(stream + i) * 4_294_967_296)
			.toString(16)
			.padStart(8, "0");
	}
	return out.slice(0, length);
};

const uuid = (rand: (stream: number) => number, stream: number) => {
	const h = hex(rand, stream, 32);
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

export const formatTimestampUs = (us: number) => {
	const date = new Date(Math.floor(us / 1000));
	const micros = String(us % 1_000_000).padStart(6, "0");
	return `${date.toISOString().slice(0, 19).replace("T", " ")}.${micros}`;
};

const pickWeighted = <T>(items: readonly T[], u: number) => {
	// Feature i gets weight 1/(i+1): the first feature dominates without starving the rest.
	const weights = items.map((_, i) => 1 / (i + 1));
	let target = u * weights.reduce((a, b) => a + b, 0);
	for (let i = 0; i < items.length; i++) {
		target -= weights[i];
		if (target < 0) return items[i];
	}
	return items[items.length - 1];
};

type EventKind = "regular" | "live" | "half-hour";

const kindOf = ({
	options,
	index,
}: {
	options: SeedOptions;
	index: number;
}): EventKind => {
	if (index < options.events) return "regular";
	if (index < options.events + options.liveHourEvents) return "live";
	return "half-hour";
};

const timestampUs = ({
	options,
	kind,
	rand,
}: {
	options: SeedOptions;
	kind: EventKind;
	rand: (stream: number) => number;
}) => {
	const endUs = options.end.getTime() * 1000;
	const startUs = endUs - options.days * DAY_US;
	if (kind === "live") return endUs + Math.floor(rand(1) * 60_000_000);
	if (kind === "half-hour") {
		const day = Math.floor(rand(1) * options.days);
		const edge =
			HALF_HOUR_EDGES_US[Math.floor(rand(2) * HALF_HOUR_EDGES_US.length)];
		const us = startUs - (startUs % DAY_US) + day * DAY_US + edge;
		return us >= startUs && us < endUs ? us : startUs + edge;
	}
	const spanUs = endUs - startUs;
	return startUs + Math.floor((rand(1) + rand(2) / 4_294_967_296) * spanUs);
};

const customerFor = ({
	options,
	rand,
}: {
	options: SeedOptions;
	rand: (stream: number) => number;
}) => {
	if (options.whales > 0 && rand(3) < options.whaleShare) {
		return `cus_whale_${Math.floor(rand(4) * options.whales)}`;
	}
	const index = Math.floor(options.customers * rand(4) ** options.customerSkew);
	return `cus_${String(index).padStart(6, "0")}`;
};

const propertiesFor = ({
	options,
	rand,
}: {
	options: SeedOptions;
	rand: (stream: number) => number;
}) => {
	const properties: Record<string, string> = {
		region: REGIONS[Math.floor(rand(10) * REGIONS.length)],
	};
	if (rand(11) < 0.85)
		properties.model = MODELS[Math.floor(rand(12) * MODELS.length)];
	if (options.highCardValues > 0) {
		properties.path = `/v1/items/${Math.floor(options.highCardValues * rand(13) ** 1.3)}`;
	}
	if (options.idProps) {
		properties.trace_id = uuid(rand, 20);
		if (rand(14) < 0.5) properties.job_id = hex(rand, 30, 24);
	}
	return properties;
};

export const generateEvent = ({
	options,
	runKey,
	index,
}: {
	options: SeedOptions;
	runKey: string;
	index: number;
}): SeedEvent => {
	const rand = makeRandom({ seed: options.seed, index });
	const kind = kindOf({ options, index });
	const customerId = customerFor({ options, rand });
	const value =
		options.mixedValues && rand(6) < 0.5
			? MIXED_VALUES[Math.floor(rand(7) * MIXED_VALUES.length)]
			: rand(6) < 0.1
				? null
				: 1;

	return {
		id: `seed_${runKey}_${index}`,
		org_id: options.orgId,
		env: options.env,
		timestamp: formatTimestampUs(timestampUs({ options, kind, rand })),
		event_name: pickWeighted(options.features, rand(5)),
		customer_id: customerId,
		value,
		entity_id:
			rand(8) < options.entityShare
				? `ent_${customerId.slice(4)}_${Math.floor(rand(9) * 5)}`
				: null,
		internal_product_id: PRODUCTS[Math.floor(rand(15) * PRODUCTS.length)],
		properties: propertiesFor({ options, rand }),
		deductions: {},
	};
};
