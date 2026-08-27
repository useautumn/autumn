import {
	type MeteringEvent,
	type MeteringEventType,
	parseMeteringEvent,
} from "@/internal/metering/events/meteringEventSchema.js";

const BASE_EVENT_TS = 1_700_000_000_000;

export const makeEvent = ({
	id,
	type,
	value = 1,
	customerId = "cus_1",
	featureId = "messages",
	orgId = "org_1",
	env = "sandbox",
	entityId,
	eventTs = BASE_EVENT_TS,
}: {
	id: string;
	type: MeteringEventType;
	value?: number;
	customerId?: string;
	featureId?: string;
	orgId?: string;
	env?: string;
	entityId?: string;
	eventTs?: number;
}): MeteringEvent =>
	parseMeteringEvent({
		input: {
			v: 1,
			id,
			type,
			org_id: orgId,
			env,
			customer_id: customerId,
			feature_id: featureId,
			value,
			...(entityId === undefined ? {} : { entity_id: entityId }),
			event_ts: eventTs,
		},
	});

// mulberry32 — a seeded PRNG so generated event streams are byte-reproducible
// across runs and machines. Math.random() would make the fold untestable.
const createSeededRandom = ({ seed }: { seed: number }) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
};

const rollEventType = ({ roll }: { roll: number }): MeteringEventType => {
	if (roll < 0.15) return "grant";
	if (roll < 0.2) return "reset";
	// Rare on purpose: a set overwrites the meter wholesale, so a heavy mix
	// would keep flattening the balances the deduct path is meant to exercise.
	if (roll < 0.21) return "set";
	return "deduct";
};

export const generateEvents = ({
	count,
	seed,
	customerCount = 20,
	featureCount = 3,
}: {
	count: number;
	seed: number;
	customerCount?: number;
	featureCount?: number;
}): MeteringEvent[] => {
	const random = createSeededRandom({ seed });
	const events: MeteringEvent[] = [];

	for (let index = 0; index < count; index++) {
		const type = rollEventType({ roll: random() });
		const customerId = `cus_${Math.floor(random() * customerCount)}`;
		const featureId = `feature_${Math.floor(random() * featureCount)}`;
		const installsBalance = type === "grant" || type === "set";
		const value = installsBalance
			? 100 + Math.floor(random() * 400)
			: 1 + Math.floor(random() * 60);

		// Replay a recent id occasionally so the dedupe window is exercised.
		const replayIndex = Math.floor(random() * 40) + 1;
		const shouldReplay = random() < 0.05 && index > replayIndex;
		const id = shouldReplay ? `evt_${index - replayIndex}` : `evt_${index}`;

		events.push(
			makeEvent({
				id,
				type,
				value,
				customerId,
				featureId,
				eventTs: BASE_EVENT_TS + index,
			}),
		);
	}

	return events;
};
