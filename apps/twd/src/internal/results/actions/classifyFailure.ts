import {
	type FailureKind,
	type FailureTriage,
	isFailedFileStatus,
	type RunFile,
	type TriagedFailure,
} from "../../../api/contract.ts";

export const NEW_FAILURE_MIN_PASS_RATE = 0.9;
export const FAILS_ON_DEV_MAX_PASS_RATE = 0.1;
const FAILS_EVERY_DEV_RUN_MIN_SAMPLES = 3;

export type DevBaseline = { passRate: number; samples: number };

export const classifyFailure = ({
	baseline,
}: {
	baseline: DevBaseline | undefined;
}): FailureKind => {
	if (!baseline) return "no_dev_history";
	if (baseline.passRate >= NEW_FAILURE_MIN_PASS_RATE) return "new_failure";
	if (baseline.passRate <= FAILS_ON_DEV_MAX_PASS_RATE) return "fails_on_dev";
	return "flaky_on_dev";
};

/** Known red: the file failed every one of at least 3 recent dev baseline runs, so a retry can't change the verdict. */
export const failsEveryDevRun = ({ passRate, samples }: DevBaseline) =>
	passRate === 0 && samples >= FAILS_EVERY_DEV_RUN_MIN_SAMPLES;

const isFinalFailure = (file: RunFile) => isFailedFileStatus(file.status);

/** Attempt 2 only follows a failed first attempt; worker-death reschedules keep the attempt number. */
const isRetrying = (file: RunFile) =>
	file.attempt >= 2 && (file.status === "running" || file.status === "queued");

export const needsTriage = (file: RunFile) =>
	isFinalFailure(file) || isRetrying(file);

const KIND_ORDER: FailureKind[] = [
	"new_failure",
	"flaky_on_dev",
	"fails_on_dev",
	"no_dev_history",
];

const KIND_LABEL: Record<FailureKind, string> = {
	new_failure: "new",
	flaky_on_dev: "flaky on dev",
	fails_on_dev: "fail on dev",
	no_dev_history: "no history",
};

const countByKind = (failures: TriagedFailure[]) =>
	failures.length === 0
		? ""
		: `: ${KIND_ORDER.map(
				(kind) =>
					`${failures.filter((f) => f.kind === kind).length} ${KIND_LABEL[kind]}`,
			).join(", ")}`;

/** Classifies failed and retrying files against dev; new failures sort first so they get acted on first. */
export const triageFiles = ({
	files,
	baselines,
}: {
	files: RunFile[];
	baselines: Map<string, DevBaseline>;
}): FailureTriage => {
	const failures = files
		.filter(needsTriage)
		.map((file): TriagedFailure => {
			const baseline = baselines.get(file.file);
			return {
				file: file.file,
				kind: classifyFailure({ baseline }),
				devPassRate: baseline?.passRate ?? null,
				devSamples: baseline?.samples ?? 0,
				retrying: !isFinalFailure(file),
			};
		})
		.sort(
			(a, b) =>
				KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
				a.file.localeCompare(b.file),
		);
	const final = failures.filter((f) => !f.retrying);
	const retrying = failures.filter((f) => f.retrying);
	const retryingSummary =
		retrying.length > 0
			? `; ${retrying.length} retrying after a failed first attempt${countByKind(retrying)}`
			: "";
	return {
		summary: `${final.length} failed${countByKind(final)}${retryingSummary}`,
		failures,
	};
};
