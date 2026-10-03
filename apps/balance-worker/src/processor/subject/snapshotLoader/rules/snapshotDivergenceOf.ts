import {
	canonicalizeJsonValue,
	type JsonValue,
	type SubjectState,
} from "@autumn/balance-engine";

/** The revision is the worker's own count of what it applied, never a row's; every other field must agree. */
const fieldsCompared = (state: SubjectState) =>
	(Object.keys(state) as (keyof SubjectState)[]).filter(
		(field) => field !== "revision",
	);

const fingerprintOf = (value: unknown) =>
	JSON.stringify(canonicalizeJsonValue(value as JsonValue));

/** The fields where a snapshot row disagrees with the rows it stands in for; empty when it could have served. */
export const snapshotDivergenceOf = ({
	snapshot,
	baseline,
}: {
	snapshot: SubjectState;
	baseline: SubjectState;
}): (keyof SubjectState)[] =>
	fieldsCompared(baseline).filter(
		(field) =>
			fingerprintOf(snapshot[field]) !== fingerprintOf(baseline[field]),
	);
