import { performance } from "node:perf_hooks";
import {
	applyMutation,
	computeTrackDecision,
	subjectStateToFullSubject,
	type TrackCommand,
} from "@autumn/balance-engine";
import { subjectsToBalanceWebhooks } from "@autumn/balance-webhooks";
import { fullSubjectToCustomerEntitlements } from "@autumn/shared";
import { trackCommandToDeductionRequest } from "../../../../../packages/balance-engine/src/commands/track/trackCommandToDeductionRequest.js";
import { trackOutcomeToMutation } from "../../../../../packages/balance-engine/src/commands/track/trackOutcomeToMutation.js";
import {
	deductFromBuckets,
	deductionStateToOutcome,
} from "../../../../../packages/balance-engine/src/deduction/deduct.js";
import { resolveBillingControls } from "../../../../../packages/balance-engine/src/deduction/setup/resolveBillingControls.js";
import { resolveUsageWindowLimits } from "../../../../../packages/balance-engine/src/deduction/setup/resolveUsageWindowLimits.js";
import { selectDeductionRows } from "../../../../../packages/balance-engine/src/deduction/setup/selectDeductionRows.js";
import { setupDeductionContext } from "../../../../../packages/balance-engine/src/deduction/setup/setupDeductionContext.js";
import type { DeductionState } from "../../../../../packages/balance-engine/src/deduction/types/deductionState.js";
import { fullSubjectToHeldRows } from "../../../../../packages/balance-engine/src/utils/subjectUtils/convertSubjectUtils.js";
import { mutationToCheckCommand } from "../../../../../packages/balance-webhooks/src/common/convertMutation/mutationToCheckCommand.js";
import { outcomeToAffectedFeatures } from "../../../../../packages/balance-webhooks/src/common/convertOutcome/outcomeToAffectedFeatures.js";
import { checkLimitReached } from "../../../../../packages/balance-webhooks/src/limitReached/checkLimitReached.js";
import { checkUsageAlerts } from "../../../../../packages/balance-webhooks/src/usageAlerts/checkUsageAlerts.js";
import { decideAutoTopupEffects } from "../../../src/processor/effects/decideAutoTopupEffects.js";
import {
	createCatalogFor,
	createTrackCommand,
	testIdentity,
	testOccurredAt,
} from "../../fixtures/mutations.js";
import { buildScenario } from "../track-throughput/scenarios.js";

/** The two expensive steps of a warm decide, split into their parts: where the deduction and the effect deciders allocate. */
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
const request = trackCommandToDeductionRequest({ command });
const { Decimal } = (await import(
	Bun.resolveSync(
		"decimal.js",
		`${import.meta.dir}/../../../../../packages/balance-engine`,
	)
)) as { Decimal: new (value: number) => DeductionState["remaining"] };
const context = setupDeductionContext({
	fullSubject,
	selection: request.selection,
});
const freshState = (): DeductionState => ({
	remaining: new Decimal(request.value),
	terms: request.terms,
	deltas: [],
	usageWindowConsumed: new Map(),
});
const drawn = freshState();
deductFromBuckets({ context, deductionState: drawn });
const outcome = deductionStateToOutcome({
	context,
	deductionState: drawn,
	request,
});
const decision = computeTrackDecision({ fullSubject, command });
const mutation = decision.mutation;
const nextState = applyMutation({ state, mutation });
const after = subjectStateToFullSubject({
	state: nextState,
	catalog,
	entityId: null,
});
const features = outcomeToAffectedFeatures({
	outcome,
	fullSubject: after,
	trackedFeatureId: command.featureId,
});
const feature = features[0];
if (!feature) throw new Error("no affected feature");
const checkCommand = mutationToCheckCommand({ mutation, feature });
if (!checkCommand) throw new Error("no check command");

const selected = selectDeductionRows({
	fullSubject,
	selection: request.selection,
});
const steps: Record<string, () => unknown> = {
	"shared: fullSubjectToCustomerEntitlements (one feature)": () =>
		fullSubjectToCustomerEntitlements({
			fullSubject,
			featureIds: [command.featureId],
			now: testOccurredAt,
		}),
	"engine: fullSubjectToHeldRows": () => fullSubjectToHeldRows({ fullSubject }),
	"deduction: selectDeductionRows": () =>
		selectDeductionRows({ fullSubject, selection: request.selection }),
	"deduction: resolveBillingControls": () =>
		resolveBillingControls({
			fullSubject,
			featureId: command.featureId,
			customerEntitlements: selected.customerEntitlements,
		}),
	"deduction: resolveUsageWindowLimits": () =>
		resolveUsageWindowLimits({
			fullSubject,
			selection: request.selection,
			customerEntitlements: selected.customerEntitlements,
		}),
	"deduction: setupDeductionContext": () =>
		setupDeductionContext({ fullSubject, selection: request.selection }),
	"deduction: deductFromBuckets": () => {
		const deductionState = freshState();
		deductFromBuckets({ context, deductionState });
		return deductionState;
	},
	"deduction: deductionStateToOutcome": () =>
		deductionStateToOutcome({ context, deductionState: drawn, request }),
	"track: trackOutcomeToMutation (usage event fields)": () =>
		trackOutcomeToMutation({ command, outcome, fullSubject }),
	"effects: outcomeToAffectedFeatures": () =>
		outcomeToAffectedFeatures({
			outcome,
			fullSubject: after,
			trackedFeatureId: command.featureId,
		}),
	"effects: checkLimitReached": () =>
		checkLimitReached({
			command: checkCommand,
			outcome,
			before: fullSubject,
			after,
		}),
	"effects: checkUsageAlerts": () =>
		checkUsageAlerts({ command: checkCommand, before: fullSubject, after }),
	"effects: subjectsToBalanceWebhooks (all)": () =>
		subjectsToBalanceWebhooks({
			mutation,
			outcome,
			before: fullSubject,
			after,
		}),
	"effects: decideAutoTopupEffects": () =>
		decideAutoTopupEffects({ mutation, after }),
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
