import { createHash } from "node:crypto";

export type SeedOptions = {
	orgId: string;
	env: string;
	features: string[];
	events: number;
	days: number;
	/** Exclusive window end (UTC, hour-aligned); the hour starting here is the "live" hour. */
	end: Date;
	seed: number;
	customers: number;
	customerSkew: number;
	whales: number;
	whaleShare: number;
	entityShare: number;
	highCardValues: number;
	idProps: boolean;
	mixedValues: boolean;
	liveHourEvents: number;
	halfHourEvents: number;
	batchSize: number;
	/** Trailing events sent as separate small inserts, so rollups hold unmerged duplicate keys. */
	smallBatchEvents: number;
	smallBatchSize: number;
	concurrency: number;
	presets: string[];
	dryRun: boolean;
	allowOtherRuns: boolean;
	verify: boolean;
};

type GenerationOverrides = Partial<
	Pick<
		SeedOptions,
		| "whales"
		| "whaleShare"
		| "entityShare"
		| "highCardValues"
		| "idProps"
		| "mixedValues"
		| "liveHourEvents"
		| "halfHourEvents"
		| "smallBatchEvents"
	>
>;

export const PRESETS: Record<string, GenerationOverrides> = {
	default: {},
	whales: { whales: 3, whaleShare: 0.6 },
	entities: { entityShare: 0.4 },
	"high-card": { highCardValues: 300_000 },
	"id-props": { idProps: true },
	values: { mixedValues: true },
	"small-batches": { smallBatchEvents: 100_000 },
	"live-hour": { liveHourEvents: 5_000 },
	"half-hour-tz": { halfHourEvents: 20_000 },
};
PRESETS.all = Object.assign({}, ...Object.values(PRESETS));

export const SEED_OPTION_FLAGS = {
	org: { type: "string" },
	env: { type: "string" },
	features: { type: "string" },
	preset: { type: "string" },
	events: { type: "string" },
	days: { type: "string" },
	end: { type: "string" },
	seed: { type: "string" },
	customers: { type: "string" },
	"customer-skew": { type: "string" },
	whales: { type: "string" },
	"whale-share": { type: "string" },
	"entity-share": { type: "string" },
	"high-card": { type: "string" },
	"id-props": { type: "boolean" },
	values: { type: "boolean" },
	"live-hour": { type: "string" },
	"half-hour-tz": { type: "string" },
	"batch-size": { type: "string" },
	"small-batches": { type: "string" },
	"small-batch-size": { type: "string" },
	concurrency: { type: "string" },
	"dry-run": { type: "boolean" },
	"allow-other-runs": { type: "boolean" },
	"no-verify": { type: "boolean" },
} as const;

type FlagValues = { [K in keyof typeof SEED_OPTION_FLAGS]?: string | boolean };

const HOUR_MS = 3_600_000;

const num = (value: string | boolean | undefined) => {
	if (value === undefined || typeof value === "boolean") return undefined;
	const parsed = Number(value.replaceAll("_", ""));
	if (!Number.isFinite(parsed)) throw new Error(`Not a number: ${value}`);
	return parsed;
};

const parseEnd = (value: string | undefined) => {
	const date = value
		? new Date(
				value.includes("T") || value.endsWith("Z")
					? value
					: `${value.replace(" ", "T")}Z`,
			)
		: new Date();
	if (Number.isNaN(date.getTime())) throw new Error(`Invalid --end: ${value}`);
	return new Date(Math.floor(date.getTime() / HOUR_MS) * HOUR_MS);
};

export const parseSeedOptions = ({
	values,
}: {
	values: FlagValues;
}): SeedOptions => {
	const presets = String(values.preset ?? "default")
		.split(",")
		.filter(Boolean);
	const unknown = presets.filter((name) => !PRESETS[name]);
	if (unknown.length) {
		throw new Error(
			`Unknown preset(s) ${unknown.join(", ")}; known: ${Object.keys(PRESETS).join(", ")}`,
		);
	}
	const fromPresets: GenerationOverrides = Object.assign(
		{},
		...presets.map((name) => PRESETS[name]),
	);

	const options: SeedOptions = {
		orgId: String(values.org ?? "org_seed"),
		env: String(values.env ?? "sandbox"),
		features: String(values.features ?? "api_calls,ai_credits,emails")
			.split(",")
			.filter(Boolean),
		events: num(values.events) ?? 2_000_000,
		days: num(values.days) ?? 92,
		end: parseEnd(values.end as string | undefined),
		seed: num(values.seed) ?? 1,
		customers: num(values.customers) ?? 5_000,
		customerSkew: num(values["customer-skew"]) ?? 2.5,
		whales: num(values.whales) ?? fromPresets.whales ?? 0,
		whaleShare: num(values["whale-share"]) ?? fromPresets.whaleShare ?? 0,
		entityShare: num(values["entity-share"]) ?? fromPresets.entityShare ?? 0,
		highCardValues: num(values["high-card"]) ?? fromPresets.highCardValues ?? 0,
		idProps: Boolean(values["id-props"] ?? fromPresets.idProps ?? false),
		mixedValues: Boolean(values.values ?? fromPresets.mixedValues ?? false),
		liveHourEvents: num(values["live-hour"]) ?? fromPresets.liveHourEvents ?? 0,
		halfHourEvents:
			num(values["half-hour-tz"]) ?? fromPresets.halfHourEvents ?? 0,
		batchSize: num(values["batch-size"]) ?? 50_000,
		smallBatchEvents:
			num(values["small-batches"]) ?? fromPresets.smallBatchEvents ?? 0,
		smallBatchSize: num(values["small-batch-size"]) ?? 500,
		concurrency: num(values.concurrency) ?? 4,
		presets,
		dryRun: Boolean(values["dry-run"]),
		allowOtherRuns: Boolean(values["allow-other-runs"]),
		verify: !values["no-verify"],
	};
	if (options.features.length === 0)
		throw new Error("--features needs at least one feature id");
	if (options.whales > 0 && options.whaleShare <= 0) options.whaleShare = 0.5;
	return options;
};

/** Fields that only change how rows are sent; everything else feeds the run key. */
const SEND_ONLY_FIELDS = new Set<keyof SeedOptions>([
	"batchSize",
	"smallBatchEvents",
	"smallBatchSize",
	"concurrency",
	"presets",
	"dryRun",
	"allowOtherRuns",
	"verify",
]);

export const generationKey = ({ options }: { options: SeedOptions }) => {
	const data = Object.entries(options).filter(
		([key]) => !SEND_ONLY_FIELDS.has(key as keyof SeedOptions),
	);
	return createHash("sha256")
		.update(JSON.stringify(data))
		.digest("hex")
		.slice(0, 10);
};

export const totalEvents = ({ options }: { options: SeedOptions }) =>
	options.events + options.liveHourEvents + options.halfHourEvents;

export type BatchRange = {
	batch: number;
	start: number;
	end: number;
	small: boolean;
};

/** Big batches first, then the trailing small-batch events; boundaries depend only on the options. */
export const batchRanges = ({
	options,
}: {
	options: SeedOptions;
}): BatchRange[] => {
	const total = totalEvents({ options });
	const smallStart = total - Math.min(options.smallBatchEvents, total);
	const ranges: BatchRange[] = [];
	const push = (from: number, to: number, size: number, small: boolean) => {
		for (let start = from; start < to; start += size) {
			ranges.push({
				batch: ranges.length,
				start,
				end: Math.min(to, start + size),
				small,
			});
		}
	};
	push(0, smallStart, options.batchSize, false);
	push(smallStart, total, options.smallBatchSize, true);
	return ranges;
};
