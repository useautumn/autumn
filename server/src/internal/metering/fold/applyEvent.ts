import type { MeteringEvent } from "../events/meteringEventSchema.js";
import {
	type DedupeWindow,
	type FeatureMeter,
	type MeterState,
	meterSubjectKeyOf,
} from "./meterState.js";

export type ApplyEventResult =
	| "applied"
	| "rejected_insufficient"
	| "duplicate";

const EMPTY_METER: FeatureMeter = { granted: 0, balance: 0 };

const recordEventId = ({
	dedupe,
	id,
}: {
	dedupe: DedupeWindow;
	id: string;
}): DedupeWindow => {
	const retained =
		dedupe.ids.length >= dedupe.capacity
			? dedupe.ids.slice(dedupe.ids.length - dedupe.capacity + 1)
			: dedupe.ids.slice();
	retained.push(id);
	return { capacity: dedupe.capacity, ids: retained };
};

const foldMeter = ({
	meter,
	event,
}: {
	meter: FeatureMeter;
	event: MeteringEvent;
}): { meter: FeatureMeter; result: ApplyEventResult } => {
	if (event.type === "grant") {
		return {
			meter: {
				granted: meter.granted + event.value,
				balance: meter.balance + event.value,
			},
			result: "applied",
		};
	}

	// An absolute write, not a delta: the source installed a balance the mirror
	// cannot express as an increment, so the meter takes it wholesale. Granted
	// moves with it because the fold has no other record of the allowance behind
	// an absolute write, and a later reset has to restore to the set value.
	if (event.type === "set") {
		return {
			meter: { granted: event.value, balance: event.value },
			result: "applied",
		};
	}

	if (event.type === "reset") {
		return {
			meter: { granted: meter.granted, balance: meter.granted },
			result: "applied",
		};
	}

	if (meter.balance < event.value) {
		return { meter, result: "rejected_insufficient" };
	}

	return {
		meter: { granted: meter.granted, balance: meter.balance - event.value },
		result: "applied",
	};
};

export const applyEvent = ({
	state,
	event,
}: {
	state: MeterState;
	event: MeteringEvent;
}): { state: MeterState; result: ApplyEventResult } => {
	if (state.dedupe.ids.includes(event.id)) {
		return { state, result: "duplicate" };
	}

	const subjectKey = meterSubjectKeyOf({
		orgId: event.org_id,
		env: event.env,
		customerId: event.customer_id,
	});
	const current =
		state.customers[subjectKey]?.[event.feature_id] ?? EMPTY_METER;
	const { meter, result } = foldMeter({ meter: current, event });
	const dedupe = recordEventId({ dedupe: state.dedupe, id: event.id });

	// A rejected deduct still consumes its idempotency key, so a retry of the
	// same event id answers "duplicate" instead of being re-evaluated later.
	if (result === "rejected_insufficient") {
		return {
			state: { version: state.version, customers: state.customers, dedupe },
			result,
		};
	}

	return {
		state: {
			version: state.version,
			customers: {
				...state.customers,
				[subjectKey]: {
					...state.customers[subjectKey],
					[event.feature_id]: meter,
				},
			},
			dedupe,
		},
		result,
	};
};
