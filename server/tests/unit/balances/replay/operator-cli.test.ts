import { describe, expect, test } from "bun:test";
import { runReplayOperator } from "@/internal/balances/replay/operator/runReplayOperator.js";
import { parseReplayOperatorArgs } from "../../../../../scripts/balance-replay/parseReplayOperatorArgs.js";

const MANIFEST_PATH = "/tmp/balance-replay/manifest.json";
const POLICY_PATH = "/tmp/balance-replay/target-policy.json";
const REQUIRED_ARGS = [
	"--manifest",
	MANIFEST_PATH,
	"--target-policy",
	POLICY_PATH,
];
const DEFAULT_MAX_REQUESTS = 1000;
const DEFAULT_REQUESTS_PER_SECOND = 10;

const STAGING_BROKERS = [
	"b-1.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9098",
	"b-2.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9098",
	"b-3.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9098",
	"b-4.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9098",
];
const STAGING_DEPLOYMENT = "tf-balance-staging-v2-512";
const STAGING_TOPIC = "tf-balance-staging-v2-512-ownership";
const STAGING_PARTITION_COUNT = 512;
const STAGING_REGION = "us-east-1";
const POLICY_HOSTNAME = "tf-balance-staging-db.internal";
const POLICY_PORT = 5432;
const POLICY_DATABASE = "balance_staging";
const DATABASE_USER = "replay_operator";
const DATABASE_SECRET = "sup3rsecret";
const STAGING_DATABASE_URL = `postgresql://${DATABASE_USER}:${DATABASE_SECRET}@${POLICY_HOSTNAME}:${POLICY_PORT}/${POLICY_DATABASE}`;
const PRODUCTION_HOSTNAME = "tf-balance-prod-db.internal";
const PRODUCTION_DATABASE = "balance_prod";
const PRODUCTION_DATABASE_URL = `postgresql://${DATABASE_USER}:${DATABASE_SECRET}@${PRODUCTION_HOSTNAME}:${POLICY_PORT}/${PRODUCTION_DATABASE}`;

type ReplayEnv = "live" | "sandbox";

const LOGICAL_LIVE_ENV: ReplayEnv = "live";
const LOGICAL_SANDBOX_ENV: ReplayEnv = "sandbox";
const ORG_ID = "org_replay_operator";
const FEATURE_ID = "messages";
const EVENT_NAME = "message_sent";
const ALPHA_CUSTOMER_ID = "cus_replay_alpha";
const BETA_CUSTOMER_ID = "cus_replay_beta";
const BASELINE_ID = "replay-baseline-2024-03-01";
const BASELINE_CAPTURED_AT_MS = 1_709_251_200_000;
const WINDOW_START_MS = BASELINE_CAPTURED_AT_MS;
const WINDOW_END_MS = BASELINE_CAPTURED_AT_MS + 600_000;
const OBSERVATION_IDS = [
	"observation-1",
	"observation-2",
	"observation-3",
] as const;
const REQUEST_BODY_MARKER = "replay-body-must-stay-private";
const MANIFEST_CUSTOMER_COUNT = 2;
const MANIFEST_REQUEST_COUNT = 3;
const EXPANDED_REQUEST_COUNT = 5;

const REPLAY_REPORT = {
	selected: MANIFEST_REQUEST_COUNT,
	completed: MANIFEST_REQUEST_COUNT,
	refused: 0,
	failed: 0,
} as const;

const EXPECTED_TARGET = {
	deployment: STAGING_DEPLOYMENT,
	topic: STAGING_TOPIC,
	partitionCount: STAGING_PARTITION_COUNT,
	region: STAGING_REGION,
	brokers: STAGING_BROKERS,
	database: {
		hostname: POLICY_HOSTNAME,
		port: POLICY_PORT,
		database: POLICY_DATABASE,
	},
};

type OperatorOptions = {
	execute: boolean;
	confirmFrozenBaseline: boolean;
	maxRequests: number;
	requestsPerSecond: number;
};

type OperatorOpenCall = {
	manifest: unknown;
	target: unknown;
	signal?: AbortSignal;
};

type OperatorRunCall = {
	manifest: unknown;
	requestsPerSecond: number;
	signal?: AbortSignal;
};

type OperatorResources = {
	run: (input: OperatorRunCall) => Promise<unknown>;
	close: () => Promise<void>;
};

type OperatorResourceFactory = (
	input: OperatorOpenCall,
) => Promise<OperatorResources>;

type ResourceRecorder = {
	openResources: OperatorResourceFactory;
	opens: OperatorOpenCall[];
	runs: OperatorRunCall[];
	readCloseCount(): number;
	readCloseSettled(): boolean;
};

type OperatorScenario = {
	manifestInput?: unknown;
	targetInput?: unknown;
	policyInput?: unknown;
	options?: Partial<OperatorOptions>;
	openResources: OperatorResourceFactory;
	signal?: AbortSignal;
};

type RequestFixture = {
	id: string;
	customerId: string;
	archivedAtMs: number;
	env?: ReplayEnv;
};

const DRY_RUN_OPTIONS: OperatorOptions = {
	execute: false,
	confirmFrozenBaseline: false,
	maxRequests: DEFAULT_MAX_REQUESTS,
	requestsPerSecond: DEFAULT_REQUESTS_PER_SECOND,
};

const EXECUTE_OPTIONS: Partial<OperatorOptions> = {
	execute: true,
	confirmFrozenBaseline: true,
};

const buildPolicyInput = () => ({
	database: {
		hostname: POLICY_HOSTNAME,
		port: POLICY_PORT,
		database: POLICY_DATABASE,
	},
});

const buildTargetInput = (overrides: Record<string, unknown> = {}) => ({
	databaseUrl: STAGING_DATABASE_URL,
	brokers: [...STAGING_BROKERS],
	deployment: STAGING_DEPLOYMENT,
	topic: STAGING_TOPIC,
	partitionCount: STAGING_PARTITION_COUNT,
	region: STAGING_REGION,
	...overrides,
});

const buildBaselineInput = () => ({
	id: BASELINE_ID,
	capturedAtMs: BASELINE_CAPTURED_AT_MS,
});

const buildWindowInput = () => ({
	startMs: WINDOW_START_MS,
	endMs: WINDOW_END_MS,
});

function buildTrackRequest({
	id,
	customerId,
	archivedAtMs,
	env = LOGICAL_LIVE_ENV,
}: RequestFixture) {
	return {
		id,
		archivedAtMs,
		orgId: ORG_ID,
		env,
		customerId,
		operation: "track",
		body: {
			customer_id: customerId,
			feature_id: FEATURE_ID,
			value: 1,
			idempotency_key: `${REQUEST_BODY_MARKER}-${id}`,
		},
	};
}

function buildCheckRequest({
	id,
	customerId,
	archivedAtMs,
	env = LOGICAL_LIVE_ENV,
}: RequestFixture) {
	return {
		id,
		archivedAtMs,
		orgId: ORG_ID,
		env,
		customerId,
		operation: "check",
		body: {
			customer_id: customerId,
			feature_id: FEATURE_ID,
			required_balance: 1,
			idempotency_key: `${REQUEST_BODY_MARKER}-${id}`,
		},
	};
}

/** Event-name tracks carry no feature, so this customer's cohort has an empty union. */
function buildEventNameTrackRequest({
	id,
	customerId,
	archivedAtMs,
	env = LOGICAL_LIVE_ENV,
}: RequestFixture) {
	return {
		id,
		archivedAtMs,
		orgId: ORG_ID,
		env,
		customerId,
		operation: "track",
		body: {
			customer_id: customerId,
			event_name: EVENT_NAME,
			value: 1,
			idempotency_key: `${REQUEST_BODY_MARKER}-${id}`,
		},
	};
}

function buildManifestFrom({ requests }: { requests: unknown }) {
	return {
		baseline: buildBaselineInput(),
		window: buildWindowInput(),
		requests,
	};
}

function buildManifestInput({
	env = LOGICAL_LIVE_ENV,
}: {
	env?: ReplayEnv;
} = {}) {
	return buildManifestFrom({
		requests: [
			buildTrackRequest({
				id: OBSERVATION_IDS[0],
				customerId: ALPHA_CUSTOMER_ID,
				archivedAtMs: WINDOW_START_MS,
				env,
			}),
			buildCheckRequest({
				id: OBSERVATION_IDS[1],
				customerId: ALPHA_CUSTOMER_ID,
				archivedAtMs: WINDOW_START_MS + 120,
				env,
			}),
			buildEventNameTrackRequest({
				id: OBSERVATION_IDS[2],
				customerId: BETA_CUSTOMER_ID,
				archivedAtMs: WINDOW_START_MS + 240,
				env,
			}),
		],
	});
}

function buildExpandedManifestInput({
	requestCount,
}: {
	requestCount: number;
}) {
	const requests: ReturnType<typeof buildTrackRequest>[] = [];
	for (let index = 0; index < requestCount; index += 1) {
		requests.push(
			buildTrackRequest({
				id: `observation-${index + 1}`,
				customerId: index % 2 === 0 ? ALPHA_CUSTOMER_ID : BETA_CUSTOMER_ID,
				archivedAtMs: WINDOW_START_MS + index,
			}),
		);
	}
	return buildManifestFrom({ requests });
}

function buildRequestMissingOperation() {
	return {
		id: OBSERVATION_IDS[0],
		archivedAtMs: WINDOW_START_MS,
		orgId: ORG_ID,
		env: LOGICAL_LIVE_ENV,
		customerId: ALPHA_CUSTOMER_ID,
		body: { customer_id: ALPHA_CUSTOMER_ID, feature_id: FEATURE_ID, value: 1 },
	};
}

function buildRequestWithMismatchedBodyCustomer() {
	const request = buildTrackRequest({
		id: OBSERVATION_IDS[0],
		customerId: ALPHA_CUSTOMER_ID,
		archivedAtMs: WINDOW_START_MS,
	});
	return {
		...request,
		body: { ...request.body, customer_id: BETA_CUSTOMER_ID },
	};
}

function createResourceRecorder({
	onRun,
}: {
	onRun?: () => Promise<unknown>;
} = {}): ResourceRecorder {
	const opens: OperatorOpenCall[] = [];
	const runs: OperatorRunCall[] = [];
	let closeCount = 0;
	let closeSettled = false;
	async function close(): Promise<void> {
		closeCount += 1;
		await Bun.sleep(0);
		closeSettled = true;
	}
	async function run(input: OperatorRunCall): Promise<unknown> {
		runs.push(input);
		if (onRun) return await onRun();
		return REPLAY_REPORT;
	}
	async function openResources(
		input: OperatorOpenCall,
	): Promise<OperatorResources> {
		opens.push(input);
		return { run, close };
	}
	return {
		openResources,
		opens,
		runs,
		readCloseCount: () => closeCount,
		readCloseSettled: () => closeSettled,
	};
}

/** A factory that fails startup owns its own cleanup; the operator must not add one. */
function createSelfCleaningStartupFailure({ failure }: { failure: Error }): {
	openResources: OperatorResourceFactory;
	readCloseCount(): number;
} {
	let closeCount = 0;
	function openResources(): Promise<OperatorResources> {
		closeCount += 1;
		return Promise.reject(failure);
	}
	return { openResources, readCloseCount: () => closeCount };
}

function runOperator(scenario: OperatorScenario) {
	return runReplayOperator({
		manifestInput:
			"manifestInput" in scenario
				? scenario.manifestInput
				: buildManifestInput(),
		targetInput:
			"targetInput" in scenario ? scenario.targetInput : buildTargetInput(),
		policyInput:
			"policyInput" in scenario ? scenario.policyInput : buildPolicyInput(),
		options: { ...DRY_RUN_OPTIONS, ...scenario.options },
		openResources: scenario.openResources,
		signal: scenario.signal,
	});
}

async function refusalMessageFor(scenario: OperatorScenario): Promise<string> {
	try {
		await runOperator(scenario);
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}

	throw new Error("expected the replay operator to refuse");
}

function expectUntouchedResources({
	recorder,
}: {
	recorder: ResourceRecorder;
}): void {
	expect(recorder.opens).toEqual([]);
	expect(recorder.runs).toEqual([]);
	expect(recorder.readCloseCount()).toBe(0);
}

function expectNoSensitiveOutput({ text }: { text: string }): void {
	expect(text).not.toContain(DATABASE_SECRET);
	expect(text).not.toContain(DATABASE_USER);
	expect(text).not.toContain(STAGING_DATABASE_URL);
	expect(text).not.toContain(REQUEST_BODY_MARKER);
}

const INVALID_ARGUMENT_SETS: { name: string; args: string[] }[] = [
	{ name: "missing manifest", args: ["--target-policy", POLICY_PATH] },
	{ name: "missing target policy", args: ["--manifest", MANIFEST_PATH] },
	{
		name: "empty manifest path",
		args: ["--manifest", "", "--target-policy", POLICY_PATH],
	},
	{ name: "unknown flag", args: [...REQUIRED_ARGS, "--force"] },
	{ name: "positional argument", args: [...REQUIRED_ARGS, "manifest.json"] },
	{
		name: "max requests above the cap",
		args: [...REQUIRED_ARGS, "--max-requests", "1001"],
	},
	{
		name: "zero max requests",
		args: [...REQUIRED_ARGS, "--max-requests", "0"],
	},
	{
		name: "fractional max requests",
		args: [...REQUIRED_ARGS, "--max-requests", "2.5"],
	},
	{
		name: "non-numeric max requests",
		args: [...REQUIRED_ARGS, "--max-requests", "many"],
	},
	{
		name: "requests per second above the cap",
		args: [...REQUIRED_ARGS, "--requests-per-second", "11"],
	},
	{
		name: "zero requests per second",
		args: [...REQUIRED_ARGS, "--requests-per-second", "0"],
	},
	{
		name: "fractional requests per second",
		args: [...REQUIRED_ARGS, "--requests-per-second", "0.5"],
	},
];

const UNSUPPORTED_TARGET_SCENARIOS: {
	name: string;
	targetInput: unknown;
	policyInput?: unknown;
}[] = [
	{
		name: "production deployment with a matching policy",
		targetInput: buildTargetInput({
			databaseUrl: PRODUCTION_DATABASE_URL,
			deployment: "tf-balance-prod-v2-512",
			topic: "tf-balance-prod-v2-512-ownership",
		}),
		policyInput: {
			database: {
				hostname: PRODUCTION_HOSTNAME,
				port: POLICY_PORT,
				database: PRODUCTION_DATABASE,
			},
		},
	},
	{
		name: "staging-looking hostname outside the policy",
		targetInput: buildTargetInput({
			databaseUrl: `postgresql://${DATABASE_USER}:${DATABASE_SECRET}@other-staging-host.internal:${POLICY_PORT}/${POLICY_DATABASE}`,
		}),
	},
	{
		name: "incomplete broker set",
		targetInput: buildTargetInput({ brokers: STAGING_BROKERS.slice(0, 3) }),
	},
	{
		name: "unpinned partition count",
		targetInput: buildTargetInput({ partitionCount: 256 }),
	},
	{
		name: "unpinned region",
		targetInput: buildTargetInput({ region: "us-west-2" }),
	},
	{
		name: "environment hint field",
		targetInput: buildTargetInput({ env: "live" }),
	},
	{ name: "malformed target", targetInput: "tf-balance-staging-v2-512" },
];

const MALFORMED_MANIFESTS: { name: string; manifestInput: unknown }[] = [
	{ name: "null manifest", manifestInput: null },
	{ name: "empty manifest", manifestInput: {} },
	{ name: "string manifest", manifestInput: "manifest" },
	{
		name: "non-array requests",
		manifestInput: buildManifestFrom({ requests: "all" }),
	},
	{
		name: "manifest without a window",
		manifestInput: {
			baseline: buildBaselineInput(),
			requests: [
				buildTrackRequest({
					id: OBSERVATION_IDS[0],
					customerId: ALPHA_CUSTOMER_ID,
					archivedAtMs: WINDOW_START_MS,
				}),
			],
		},
	},
	{
		name: "request without an operation",
		manifestInput: buildManifestFrom({
			requests: [buildRequestMissingOperation()],
		}),
	},
	{
		name: "body customer disagreeing with the envelope",
		manifestInput: buildManifestFrom({
			requests: [buildRequestWithMismatchedBodyCustomer()],
		}),
	},
];

const INVALID_LIMIT_OPTIONS: Partial<OperatorOptions>[] = [
	{ maxRequests: 0 },
	{ maxRequests: 1001 },
	{ maxRequests: 2.5 },
	{ requestsPerSecond: 0 },
	{ requestsPerSecond: 11 },
	{ requestsPerSecond: 1.5 },
];

describe("Replay operator arguments", () => {
	test.concurrent("defaults to a dry run at the provisional limits", () => {
		expect(parseReplayOperatorArgs({ args: REQUIRED_ARGS })).toEqual({
			help: false,
			manifestPath: MANIFEST_PATH,
			policyPath: POLICY_PATH,
			execute: false,
			confirmFrozenBaseline: false,
			maxRequests: DEFAULT_MAX_REQUESTS,
			requestsPerSecond: DEFAULT_REQUESTS_PER_SECOND,
		});
	});

	test.concurrent("returns help without requiring manifest or policy", () => {
		expect(parseReplayOperatorArgs({ args: ["--help"] })).toEqual({
			help: true,
		});
	});

	test.concurrent("accepts an explicitly confirmed execution", () => {
		expect(
			parseReplayOperatorArgs({
				args: [...REQUIRED_ARGS, "--execute", "--confirm-frozen-baseline"],
			}),
		).toEqual({
			help: false,
			manifestPath: MANIFEST_PATH,
			policyPath: POLICY_PATH,
			execute: true,
			confirmFrozenBaseline: true,
			maxRequests: DEFAULT_MAX_REQUESTS,
			requestsPerSecond: DEFAULT_REQUESTS_PER_SECOND,
		});
	});

	test.concurrent("accepts lower limits below the provisional caps", () => {
		const parsed = parseReplayOperatorArgs({
			args: [
				...REQUIRED_ARGS,
				"--max-requests",
				"250",
				"--requests-per-second",
				"4",
			],
		});

		expect(parsed).toMatchObject({
			help: false,
			maxRequests: 250,
			requestsPerSecond: 4,
		});
	});

	test.concurrent(
		"requires the frozen baseline confirmation to execute",
		() => {
			expect(() =>
				parseReplayOperatorArgs({ args: [...REQUIRED_ARGS, "--execute"] }),
			).toThrow(/--confirm-frozen-baseline/);
		},
	);

	test.concurrent(
		"keeps the confirmation flag inert without an explicit execution",
		() => {
			expect(
				parseReplayOperatorArgs({
					args: [...REQUIRED_ARGS, "--confirm-frozen-baseline"],
				}),
			).toMatchObject({
				help: false,
				execute: false,
				confirmFrozenBaseline: true,
			});
		},
	);

	test.concurrent(
		"refuses incomplete, unknown and out-of-range arguments",
		() => {
			for (const scenario of INVALID_ARGUMENT_SETS) {
				expect(() =>
					parseReplayOperatorArgs({ args: scenario.args }),
				).toThrow();
			}
		},
	);
});

describe("Replay operator lifecycle", () => {
	test.concurrent("previews without opening a single resource", async () => {
		const recorder = createResourceRecorder();

		const preview = await runOperator({
			openResources: recorder.openResources,
		});

		expect(preview).toEqual({
			mode: "preview",
			target: EXPECTED_TARGET,
			limits: {
				maxRequests: DEFAULT_MAX_REQUESTS,
				requestsPerSecond: DEFAULT_REQUESTS_PER_SECOND,
			},
			manifest: {
				customerCount: MANIFEST_CUSTOMER_COUNT,
				requestCount: MANIFEST_REQUEST_COUNT,
			},
		});
		expectUntouchedResources({ recorder });
		expectNoSensitiveOutput({ text: JSON.stringify(preview) });
	});

	test.concurrent(
		"previews logically live and sandbox manifests on the pinned staging deployment",
		async () => {
			for (const env of [LOGICAL_LIVE_ENV, LOGICAL_SANDBOX_ENV]) {
				const recorder = createResourceRecorder();
				const preview = await runOperator({
					manifestInput: buildManifestInput({ env }),
					openResources: recorder.openResources,
				});

				expect(preview).toMatchObject({ mode: "preview" });
				expectUntouchedResources({ recorder });
			}
		},
	);

	test.concurrent(
		"executes with the validated target and closes resources once",
		async () => {
			const recorder = createResourceRecorder();
			const controller = new AbortController();

			const result = await runOperator({
				options: EXECUTE_OPTIONS,
				openResources: recorder.openResources,
				signal: controller.signal,
			});

			expect(result).toEqual({ mode: "executed", report: REPLAY_REPORT });
			expect(recorder.opens).toHaveLength(1);
			expect(recorder.runs).toHaveLength(1);
			const openCall = recorder.opens[0];
			const runCall = recorder.runs[0];
			expect(openCall?.target).toEqual(EXPECTED_TARGET);
			expect(openCall?.signal).toBe(controller.signal);
			expect(runCall?.manifest).toBe(openCall?.manifest);
			expect(runCall?.requestsPerSecond).toBe(DEFAULT_REQUESTS_PER_SECOND);
			expect(runCall?.signal).toBe(controller.signal);
			expect(recorder.readCloseCount()).toBe(1);
			expect(recorder.readCloseSettled()).toBe(true);
			expectNoSensitiveOutput({ text: JSON.stringify(openCall?.target) });
		},
	);

	test.concurrent(
		"closes resources exactly once when the run fails",
		async () => {
			const failure = new Error("replay run failed");
			const recorder = createResourceRecorder({
				onRun: () => Promise.reject(failure),
			});

			await expect(
				runOperator({
					options: EXECUTE_OPTIONS,
					openResources: recorder.openResources,
				}),
			).rejects.toBe(failure);
			expect(recorder.readCloseCount()).toBe(1);
			expect(recorder.readCloseSettled()).toBe(true);
		},
	);

	test.concurrent(
		"leaves startup cleanup to the factory that failed to start",
		async () => {
			const failure = new Error("replay resources failed to start");
			const startup = createSelfCleaningStartupFailure({ failure });

			await expect(
				runOperator({
					options: EXECUTE_OPTIONS,
					openResources: startup.openResources,
				}),
			).rejects.toBe(failure);
			expect(startup.readCloseCount()).toBe(1);
		},
	);

	test.concurrent(
		"refuses an unconfirmed execution before any resource",
		async () => {
			const recorder = createResourceRecorder();

			const message = await refusalMessageFor({
				options: { execute: true, confirmFrozenBaseline: false },
				openResources: recorder.openResources,
			});

			expect(message).toMatch(/confirm/i);
			expectUntouchedResources({ recorder });
		},
	);

	test.concurrent("refuses a cancelled run before any resource", async () => {
		const recorder = createResourceRecorder();
		const controller = new AbortController();
		controller.abort();

		const message = await refusalMessageFor({
			options: EXECUTE_OPTIONS,
			openResources: recorder.openResources,
			signal: controller.signal,
		});

		expect(message).toMatch(/cancel|abort/i);
		expectUntouchedResources({ recorder });
	});

	test.concurrent(
		"refuses targets outside the pinned staging deployment",
		async () => {
			for (const scenario of UNSUPPORTED_TARGET_SCENARIOS) {
				const recorder = createResourceRecorder();
				const message = await refusalMessageFor({
					options: EXECUTE_OPTIONS,
					targetInput: scenario.targetInput,
					policyInput: scenario.policyInput ?? buildPolicyInput(),
					openResources: recorder.openResources,
				});

				expect(message.length).toBeGreaterThan(0);
				expectUntouchedResources({ recorder });
			}
		},
	);

	test.concurrent(
		"refuses malformed manifests before any resource",
		async () => {
			for (const scenario of MALFORMED_MANIFESTS) {
				const recorder = createResourceRecorder();
				const message = await refusalMessageFor({
					options: EXECUTE_OPTIONS,
					manifestInput: scenario.manifestInput,
					openResources: recorder.openResources,
				});

				expect(message.length).toBeGreaterThan(0);
				expectUntouchedResources({ recorder });
			}
		},
	);

	test.concurrent("refuses limits outside the provisional caps", async () => {
		for (const options of INVALID_LIMIT_OPTIONS) {
			const recorder = createResourceRecorder();
			const message = await refusalMessageFor({
				options: { ...EXECUTE_OPTIONS, ...options },
				openResources: recorder.openResources,
			});

			expect(message.length).toBeGreaterThan(0);
			expectUntouchedResources({ recorder });
		}
	});

	test.concurrent(
		"refuses a manifest above the selected request cap instead of truncating it",
		async () => {
			const recorder = createResourceRecorder();

			const message = await refusalMessageFor({
				options: {
					...EXECUTE_OPTIONS,
					maxRequests: EXPANDED_REQUEST_COUNT - 1,
				},
				manifestInput: buildExpandedManifestInput({
					requestCount: EXPANDED_REQUEST_COUNT,
				}),
				openResources: recorder.openResources,
			});

			expect(message).toMatch(/max/i);
			expectUntouchedResources({ recorder });
		},
	);

	test.concurrent(
		"keeps credentials, URLs and request bodies out of refusals",
		async () => {
			const recorder = createResourceRecorder();

			const messages = [
				await refusalMessageFor({
					targetInput: buildTargetInput({ region: "us-west-2" }),
					openResources: recorder.openResources,
				}),
				await refusalMessageFor({
					options: { execute: true, confirmFrozenBaseline: false },
					openResources: recorder.openResources,
				}),
			];

			for (const message of messages)
				expectNoSensitiveOutput({ text: message });
			expectUntouchedResources({ recorder });
		},
	);
});
