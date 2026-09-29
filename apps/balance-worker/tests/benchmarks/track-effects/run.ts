import { performance } from "node:perf_hooks";
import {
	applyMutation,
	catalogRowsToCatalog,
	checkAfterDeduction,
	computeCheck,
	computeTrackDecision,
	type SubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import { mutationToCheckCommand } from "../../../../../packages/balance-webhooks/src/common/convertMutation/mutationToCheckCommand.js";
import { outcomeToAffectedFeatures } from "../../../../../packages/balance-webhooks/src/common/convertOutcome/outcomeToAffectedFeatures.js";
import { checkLimitReached } from "../../../../../packages/balance-webhooks/src/limitReached/checkLimitReached.js";
import { checkUsageAlerts } from "../../../../../packages/balance-webhooks/src/usageAlerts/checkUsageAlerts.js";
import { decideAutoTopupEffects } from "../../../src/processor/effects/decideAutoTopupEffects.js";
import { decideEffects } from "../../../src/processor/effects/decideEffects.js";
import { createTrackCommand, testIdentity } from "../../fixtures/mutations.js";
import { scenarios } from "../track-throughput/scenarios.js";

/** In-memory cost of one track's decision and its effects, piece by piece: no processor, no Kafka, no I/O. */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const scenario = scenarios[args.scenario ?? "typical"];
if (!scenario) throw new Error(`Unknown scenario ${args.scenario}`);
const iterations = Number(args.iterations ?? 20_000);
const warmup = Number(args.warmup ?? 2_000);

const state = scenario.stateFor({ identity: testIdentity });
const catalog = catalogRowsToCatalog({ rows: scenario.catalogRows });
const readSubject = ({ state }: { state: SubjectState }) =>
	subjectStateToFullSubject({ state, catalog, entityId: null });
const command = createTrackCommand({
	featureId: scenario.features[0],
	value: 1,
	overageBehavior: "cap",
});

const before = readSubject({ state });
const decision = computeTrackDecision({ fullSubject: before, command });
const { mutation, outcome } = decision;
const nextState = applyMutation({ state, mutation });
const after = readSubject({ state: nextState });
const [feature] = outcomeToAffectedFeatures({
	outcome,
	fullSubject: after,
	trackedFeatureId: command.featureId,
});
if (!feature) throw new Error("The track moved no feature");
const checkCommand = mutationToCheckCommand({ mutation, feature });
if (!checkCommand) throw new Error("No check command for the track");

/** Mean µs per call after a warmup; the work is pure so every call sees the same inputs. */
const measure = ({ name, run }: { name: string; run: () => unknown }) => {
	for (let i = 0; i < warmup; i++) run();
	const startedAt = performance.now();
	for (let i = 0; i < iterations; i++) run();
	return {
		name,
		microseconds: ((performance.now() - startedAt) * 1000) / iterations,
	};
};

const pieces = [
	measure({
		name: "computeTrackDecision",
		run: () => computeTrackDecision({ fullSubject: before, command }),
	}),
	measure({
		name: "applyMutation",
		run: () => applyMutation({ state, mutation }),
	}),
	measure({
		name: "readSubject(after)",
		run: () => readSubject({ state: nextState }),
	}),
	measure({
		name: "decideEffects (total)",
		run: () => decideEffects({ decision, before, after }),
	}),
	measure({
		name: "  outcomeToAffectedFeatures",
		run: () =>
			outcomeToAffectedFeatures({
				outcome,
				fullSubject: after,
				trackedFeatureId: command.featureId,
			}),
	}),
	measure({
		name: "  checkLimitReached",
		run: () =>
			checkLimitReached({ command: checkCommand, outcome, before, after }),
	}),
	measure({
		name: "    checkAfterDeduction.after",
		run: () =>
			checkAfterDeduction({
				fullSubject: before,
				command: checkCommand,
				outcome,
			}).after,
	}),
	measure({
		name: "    computeCheck(after) [old]",
		run: () => computeCheck({ fullSubject: after, command: checkCommand }),
	}),
	measure({
		name: "  checkUsageAlerts",
		run: () => checkUsageAlerts({ command: checkCommand, before, after }),
	}),
	measure({
		name: "  decideAutoTopupEffects",
		run: () => decideAutoTopupEffects({ mutation, after }),
	}),
];

const width = Math.max(...pieces.map((piece) => piece.name.length));
console.log(`scenario=${scenario.name} iterations=${iterations}\n`);
for (const piece of pieces) {
	console.log(
		`${piece.name.padEnd(width)}  ${piece.microseconds.toFixed(1).padStart(7)} µs`,
	);
}
