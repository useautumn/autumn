import { performance } from "node:perf_hooks";
import {
	applyMutation,
	computeTrackDecision,
	slimSubjectForFeatures,
	subjectStateToFullSubject,
	type TrackCommand,
} from "@autumn/balance-engine";
import { serializeMeteringRecord } from "@autumn/kafka";
import { decideEffects } from "../../../src/processor/effects/decideEffects.js";
import { loggedRecordOf } from "../../../src/processor/writer/pendingMutations.js";
import { commandToFingerprint } from "../../../src/processor/writer/receipt/commandToFingerprint.js";
import { mutationToRecord } from "../../../src/processor/writer/receipt/mutationToRecord.js";
import { reweighSubjectState } from "../../../src/processor/writer/subjectMap/createSubjectMap.js";
import {
	createCatalogFor,
	createTrackCommand,
	testIdentity,
	testOccurredAt,
} from "../../fixtures/mutations.js";
import { buildScenario } from "../track-throughput/scenarios.js";

/** Each step of a warm track decide run alone, many times, between GC-log markers: what each one allocates and costs. */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const iterations = Number(args.iterations ?? 3_000);

if (!args.child) {
	const child = Bun.spawnSync({
		cmd: [process.execPath, ...process.argv.slice(1), "--child"],
		env: { ...process.env, BUN_JSC_logGC: "1" },
		stdout: "pipe",
		stderr: "pipe",
	});
	const gcLog = child.stderr.toString();
	const report = JSON.parse(child.stdout.toString()) as Record<
		string,
		{ usPerIteration: number }
	>;
	const rows = Object.entries(report).map(([step, timing]) => {
		const start = gcLog.indexOf(`BENCH_MARK ${step} start`);
		const end = gcLog.indexOf(`BENCH_MARK ${step} end`);
		let allocatedKb = 0;
		for (const match of gcLog
			.slice(start, end)
			.matchAll(/START \S+ \S+ => \w+, ca=([0-9.]+)kb/g))
			allocatedKb += Number(match[1]);
		return {
			step,
			usPerIteration: timing.usPerIteration,
			kbPerIteration: Number((allocatedKb / iterations).toFixed(1)),
		};
	});
	console.table(rows);
	process.exit(child.exitCode ?? 1);
}

const scenario = buildScenario({
	name: "steps",
	products: Number(args.products ?? 4),
	features: Number(args.features ?? 15),
});
const state = scenario.stateFor({ identity: testIdentity });
const catalog = createCatalogFor({ state });
const command: TrackCommand = createTrackCommand({
	identity: testIdentity,
	commandId: "trk_0",
	featureId: scenario.features[0],
	value: 1,
	occurredAt: testOccurredAt,
});
const fullSubject = subjectStateToFullSubject({
	state,
	catalog,
	entityId: null,
});
const decision = computeTrackDecision({ fullSubject, command });
const nextState = applyMutation({ state, mutation: decision.mutation });
const fullSubjectAfter = subjectStateToFullSubject({
	state: nextState,
	catalog,
	entityId: null,
});
const fingerprint = commandToFingerprint({ command });
const record = mutationToRecord({
	mutation: decision.mutation,
	fingerprint,
	receiptPolicy: { retentionMs: 60_000, now: () => testOccurredAt },
});
const effects = decideEffects({
	decision,
	before: fullSubject,
	after: fullSubjectAfter,
});
const loggedRecord = loggedRecordOf({ mutation: record, effects });
const previousBytes = JSON.stringify(state).length;

const steps: Record<string, () => unknown> = {
	"command parse (zod)": () =>
		createTrackCommand({
			identity: testIdentity,
			commandId: "trk_1",
			featureId: scenario.features[0],
			value: 1,
		}),
	"join state -> full subject": () =>
		subjectStateToFullSubject({ state, catalog, entityId: null }),
	"compute track decision": () =>
		computeTrackDecision({ fullSubject, command }),
	"apply mutation -> next state": () =>
		applyMutation({ state, mutation: decision.mutation }),
	"decide effects (before/after)": () =>
		decideEffects({ decision, before: fullSubject, after: fullSubjectAfter }),
	"fingerprint + record": () =>
		loggedRecordOf({
			mutation: mutationToRecord({
				mutation: decision.mutation,
				fingerprint: commandToFingerprint({ command }),
				receiptPolicy: { retentionMs: 60_000, now: () => testOccurredAt },
			}),
			effects,
		}),
	"record.encode (kafka)": () =>
		serializeMeteringRecord({ record: loggedRecord }),
	"weigh whole state (old)": () => JSON.stringify(nextState).length,
	"reweigh changed rows (new)": () =>
		reweighSubjectState({ previous: state, previousBytes, next: nextState }),
	"slim reply for feature": () =>
		slimSubjectForFeatures({
			state: nextState,
			catalog,
			featureIds: [command.featureId],
		}),
	"reply JSON (slim state + catalog)": () =>
		JSON.stringify(
			slimSubjectForFeatures({
				state: nextState,
				catalog,
				featureIds: [command.featureId],
			}),
		),
};

const report: Record<string, { usPerIteration: number }> = {};
let sink: unknown;
for (const [step, run] of Object.entries(steps)) {
	for (let i = 0; i < 200; i++) sink = run();
	Bun.gc(true);
	console.error(`BENCH_MARK ${step} start`);
	const started = performance.now();
	for (let i = 0; i < iterations; i++) sink = run();
	const elapsed = performance.now() - started;
	Bun.gc(true);
	console.error(`BENCH_MARK ${step} end`);
	report[step] = {
		usPerIteration: Number(((elapsed * 1000) / iterations).toFixed(1)),
	};
}
if (sink === Symbol.for("never")) console.log(sink);
console.log(JSON.stringify(report));
