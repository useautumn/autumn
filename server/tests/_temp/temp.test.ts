import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const CONFIG = {
	// Stripe test clocks allow at most 3 customers per clock. Since the "short"
	// cohort currently groups 3 scenarios on one shared clock, keep this at 1 for
	// the MVP benchmark so shared-clock batching still works.
	customersPerScenario: 1,
	maxConcurrentOperations: 3,
	progressEvery: 5,
	progressIntervalMs: 30_000,
	requestTimeoutMs: 30_000,
	clockWaitSeconds: 20,
} as const;

type CohortId = "short" | "interval" | "complex";

type BenchmarkRecord = {
	scenario: string;
	customerId: string;
	cohort: CohortId;
	phase: "cohort_setup" | "initial_attach" | "advance" | "mutate" | "verify";
	operation: string;
	startedAt: number;
	endedAt: number;
	durationMs: number;
	success: boolean;
	error?: string;
	invoiceStatus?: string;
	invoiceTotal?: number;
	paymentUrlReturned?: boolean;
	note?: string;
};

type AttachResponse = {
	invoice?: {
		status?: string;
		total?: number;
	};
	payment_url?: string;
	checkout_url?: string;
	url?: string;
};

type BenchmarkCase = {
	scenarioId: string;
	customerId: string;
	cohortId: CohortId;
	responses: AttachResponse[];
};

type CohortRuntime = {
	id: CohortId;
	prefix: string;
	primaryCustomerId: string;
	customerIds: string[];
	testClockId: string;
	advancedTo: number;
	autumnV1: AutumnInt;
	productsByKey: Record<string, string>;
	cases: BenchmarkCase[];
};

type ScenarioDef = {
	id: string;
	name: string;
	cohortId: CohortId;
	initialProductKey: string;
	initialOptions?: { feature_id: string; quantity: number }[];
	runMutation: (args: {
		runtime: CohortRuntime;
		benchmarkCase: BenchmarkCase;
	}) => Promise<void>;
	runPostAdvanceMutation?: (args: {
		runtime: CohortRuntime;
		benchmarkCase: BenchmarkCase;
	}) => Promise<void>;
	verify?: (args: {
		runtime: CohortRuntime;
		benchmarkCase: BenchmarkCase;
		customer: ApiCustomerV3;
	}) => Promise<void>;
};

const percentile = ({ values, p }: { values: number[]; p: number }) => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
	return sorted[index];
};

const summarizeDurations = ({ values }: { values: number[] }) => {
	if (values.length === 0) {
		return {
			count: 0,
			avgMs: 0,
			p50Ms: 0,
			p90Ms: 0,
			maxMs: 0,
		};
	}

	const total = values.reduce((sum, value) => sum + value, 0);
	return {
		count: values.length,
		avgMs: Math.round(total / values.length),
		p50Ms: Math.round(percentile({ values, p: 50 })),
		p90Ms: Math.round(percentile({ values, p: 90 })),
		maxMs: Math.round(Math.max(...values)),
	};
};

const formatDuration = ({ ms }: { ms: number }) => {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	return `${(ms / 60_000).toFixed(1)}m`;
};

const runWithConcurrency = async <T>({
	items,
	limit,
	fn,
}: {
	items: T[];
	limit: number;
	fn: (item: T, index: number) => Promise<void>;
}) => {
	let nextIndex = 0;
	const workers = Array.from(
		{ length: Math.min(limit, items.length) },
		async () => {
			while (true) {
				const currentIndex = nextIndex;
				nextIndex += 1;
				if (currentIndex >= items.length) return;
				await fn(items[currentIndex], currentIndex);
			}
		},
	);

	await Promise.all(workers);
};

const buildCohortProducts = ({ cohortId }: { cohortId: CohortId }) => {
	if (cohortId === "short") {
		return [
			products.pro({
				id: "pro",
				items: [items.monthlyMessages({ includedUsage: 500 })],
			}),
			products.premium({
				id: "premium",
				items: [items.monthlyMessages({ includedUsage: 1000 })],
			}),
			products.base({
				id: "team",
				items: [items.allocatedUsers({ includedUsage: 0 })],
			}),
		];
	}

	if (cohortId === "interval") {
		return [
			products.pro({
				id: "pro",
				items: [items.monthlyMessages({ includedUsage: 500 })],
			}),
			products.proAnnual({
				id: "pro-annual",
				items: [items.monthlyMessages({ includedUsage: 500 })],
			}),
		];
	}

	return [
		products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		}),
		products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		}),
	];
};

const benchmarkRecords: BenchmarkRecord[] = [];
const benchmarkFailures: BenchmarkRecord[] = [];
let completedOperations = 0;
let lastProgressAt = 0;
let totalPlannedOperations = 0;
const benchmarkStart = Date.now();

const printProgress = () => {
	const now = Date.now();
	const shouldPrint =
		completedOperations % CONFIG.progressEvery === 0 ||
		now - lastProgressAt >= CONFIG.progressIntervalMs;

	if (!shouldPrint) return;

	lastProgressAt = now;
	const elapsedMs = now - benchmarkStart;
	const completedDurations = benchmarkRecords.map(
		(record) => record.durationMs,
	);
	const avgMs = completedDurations.length
		? completedDurations.reduce((sum, value) => sum + value, 0) /
			completedDurations.length
		: 0;
	const remainingOps = Math.max(
		totalPlannedOperations - completedOperations,
		0,
	);
	const etaMs = remainingOps * avgMs;

	console.log(
		`[bench] ${completedOperations}/${totalPlannedOperations} complete | elapsed=${formatDuration({ ms: elapsedMs })} | avg=${formatDuration({ ms: avgMs })} | eta=${formatDuration({ ms: etaMs })}`,
	);
};

const recordOperation = async <T>({
	scenario,
	customerId,
	cohort,
	phase,
	operation,
	note,
	fn,
	onSuccess,
}: {
	scenario: string;
	customerId: string;
	cohort: CohortId;
	phase: BenchmarkRecord["phase"];
	operation: string;
	note?: string;
	fn: () => Promise<T>;
	onSuccess?: (result: T) => Partial<BenchmarkRecord>;
}) => {
	const startedAt = Date.now();
	try {
		const result = await fn();
		const endedAt = Date.now();
		const record: BenchmarkRecord = {
			scenario,
			customerId,
			cohort,
			phase,
			operation,
			startedAt,
			endedAt,
			durationMs: endedAt - startedAt,
			success: true,
			note,
			...onSuccess?.(result),
		};
		benchmarkRecords.push(record);
		completedOperations += 1;
		printProgress();
		return result;
	} catch (error) {
		const endedAt = Date.now();
		const record: BenchmarkRecord = {
			scenario,
			customerId,
			cohort,
			phase,
			operation,
			startedAt,
			endedAt,
			durationMs: endedAt - startedAt,
			success: false,
			error: error instanceof Error ? error.message : String(error),
			note,
		};
		benchmarkRecords.push(record);
		benchmarkFailures.push(record);
		completedOperations += 1;
		printProgress();
		return undefined as T;
	}
};

const buildScenarioDefs = (): ScenarioDef[] => [
	{
		id: "pro_to_premium_midcycle",
		name: "Pro -> Premium mid-cycle",
		cohortId: "short",
		initialProductKey: "pro",
		runMutation: async ({ runtime, benchmarkCase }) => {
			const response = await runtime.autumnV1.billing.attach(
				{
					customer_id: benchmarkCase.customerId,
					product_id: runtime.productsByKey.premium,
					redirect_mode: "if_required",
				},
				{ timeout: CONFIG.requestTimeoutMs },
			);
			benchmarkCase.responses.push(response as AttachResponse);
		},
	},
	{
		id: "premium_to_pro_midcycle",
		name: "Premium -> Pro mid-cycle",
		cohortId: "short",
		initialProductKey: "premium",
		runMutation: async ({ runtime, benchmarkCase }) => {
			const response = await runtime.autumnV1.billing.attach(
				{
					customer_id: benchmarkCase.customerId,
					product_id: runtime.productsByKey.pro,
					redirect_mode: "if_required",
				},
				{ timeout: CONFIG.requestTimeoutMs },
			);
			benchmarkCase.responses.push(response as AttachResponse);
		},
	},
	{
		id: "quantity_upgrade_midcycle",
		name: "Quantity upgrade mid-cycle",
		cohortId: "short",
		initialProductKey: "team",
		initialOptions: [{ feature_id: TestFeature.Users, quantity: 5 }],
		runMutation: async ({ runtime, benchmarkCase }) => {
			const response = await runtime.autumnV1.billing.attach(
				{
					customer_id: benchmarkCase.customerId,
					product_id: runtime.productsByKey.team,
					redirect_mode: "if_required",
					options: [{ feature_id: TestFeature.Users, quantity: 20 }],
				},
				{ timeout: CONFIG.requestTimeoutMs },
			);
			benchmarkCase.responses.push(response as AttachResponse);
		},
	},
	{
		id: "monthly_to_annual_window",
		name: "Monthly -> Annual window",
		cohortId: "interval",
		initialProductKey: "pro",
		runMutation: async ({ runtime, benchmarkCase }) => {
			const response = await runtime.autumnV1.billing.attach(
				{
					customer_id: benchmarkCase.customerId,
					product_id: runtime.productsByKey.proAnnual,
					redirect_mode: "if_required",
				},
				{ timeout: CONFIG.requestTimeoutMs },
			);
			benchmarkCase.responses.push(response as AttachResponse);
		},
	},
	{
		id: "annual_to_monthly_window",
		name: "Annual -> Monthly window",
		cohortId: "interval",
		initialProductKey: "proAnnual",
		runMutation: async ({ runtime, benchmarkCase }) => {
			const response = await runtime.autumnV1.billing.attach(
				{
					customer_id: benchmarkCase.customerId,
					product_id: runtime.productsByKey.pro,
					redirect_mode: "if_required",
				},
				{ timeout: CONFIG.requestTimeoutMs },
			);
			benchmarkCase.responses.push(response as AttachResponse);
		},
	},
	{
		id: "downgrade_then_reupgrade",
		name: "Downgrade then re-upgrade",
		cohortId: "complex",
		initialProductKey: "premium",
		runMutation: async ({ runtime, benchmarkCase }) => {
			const response = await runtime.autumnV1.billing.attach(
				{
					customer_id: benchmarkCase.customerId,
					product_id: runtime.productsByKey.pro,
					redirect_mode: "if_required",
				},
				{ timeout: CONFIG.requestTimeoutMs },
			);
			benchmarkCase.responses.push(response as AttachResponse);
		},
		runPostAdvanceMutation: async ({ runtime, benchmarkCase }) => {
			const response = await runtime.autumnV1.billing.attach(
				{
					customer_id: benchmarkCase.customerId,
					product_id: runtime.productsByKey.premium,
					redirect_mode: "if_required",
				},
				{ timeout: CONFIG.requestTimeoutMs },
			);
			benchmarkCase.responses.push(response as AttachResponse);
		},
	},
];

const setupCohort = async ({
	cohortId,
	scenarios,
}: {
	cohortId: CohortId;
	scenarios: ScenarioDef[];
}): Promise<CohortRuntime> => {
	const prefix = `bench-${cohortId}`;
	const cases = scenarios.flatMap((scenario) =>
		Array.from({ length: CONFIG.customersPerScenario }, (_, index) => ({
			scenarioId: scenario.id,
			customerId: `${prefix}-${scenario.id}-${index + 1}`,
			cohortId,
			responses: [],
		})),
	);

	const primaryCustomerId = cases[0].customerId;
	const otherCustomers = cases.slice(1).map((benchmarkCase) => ({
		id: benchmarkCase.customerId,
		paymentMethod: "success" as const,
	}));

	const cohortProducts = buildCohortProducts({ cohortId });

	const result = (await recordOperation({
		scenario: `cohort:${cohortId}`,
		customerId: primaryCustomerId,
		cohort: cohortId,
		phase: "cohort_setup",
		operation: "cohort_setup",
		note: `${cases.length} customers`,
		fn: async () =>
			initScenario({
				customerId: primaryCustomerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: cohortProducts, prefix }),
					s.otherCustomers(otherCustomers),
				],
				actions: [],
			}),
	})) as unknown as Awaited<ReturnType<typeof initScenario>>;

	if (!result) {
		const setupFailures = benchmarkFailures.filter(
			(record) =>
				record.scenario === `cohort:${cohortId}` &&
				record.operation === "cohort_setup",
		);
		const setupFailure = setupFailures[setupFailures.length - 1];
		throw new Error(
			`cohort setup failed for ${cohortId}: ${setupFailure?.error ?? "unknown error"}`,
		);
	}

	if (!result.testClockId) {
		throw new Error(`cohort setup did not return a test clock for ${cohortId}`);
	}

	return {
		id: cohortId,
		prefix,
		primaryCustomerId,
		customerIds: cases.map((benchmarkCase) => benchmarkCase.customerId),
		testClockId: result.testClockId,
		advancedTo: result.advancedTo,
		autumnV1: result.autumnV1,
		productsByKey:
			cohortId === "short"
				? {
						pro: `pro_${prefix}`,
						premium: `premium_${prefix}`,
						team: `team_${prefix}`,
					}
				: cohortId === "interval"
					? {
							pro: `pro_${prefix}`,
							proAnnual: `pro-annual_${prefix}`,
						}
					: {
							pro: `pro_${prefix}`,
							premium: `premium_${prefix}`,
						},
		cases,
	};
};

const advanceCohortClock = async ({
	runtime,
	operation,
	note,
	numberOfDays,
	numberOfWeeks,
	numberOfMonths,
	toNextInvoice,
}: {
	runtime: CohortRuntime;
	operation: string;
	note: string;
	numberOfDays?: number;
	numberOfWeeks?: number;
	numberOfMonths?: number;
	toNextInvoice?: boolean;
}) => {
	const nextAdvancedTo = await recordOperation({
		scenario: `cohort:${runtime.id}`,
		customerId: runtime.primaryCustomerId,
		cohort: runtime.id,
		phase: "advance",
		operation,
		note,
		fn: async () => {
			if (toNextInvoice) {
				return advanceTestClock({
					stripeCli: ctx.stripeCli,
					testClockId: runtime.testClockId,
					advanceTo:
						new Date(runtime.advancedTo).getTime() + 32 * 24 * 60 * 60 * 1000,
					waitForSeconds: CONFIG.clockWaitSeconds,
				});
			}

			return advanceTestClock({
				stripeCli: ctx.stripeCli,
				testClockId: runtime.testClockId,
				startingFrom: new Date(runtime.advancedTo),
				numberOfDays,
				numberOfWeeks,
				numberOfMonths,
				waitForSeconds: CONFIG.clockWaitSeconds,
			});
		},
	});

	runtime.advancedTo = nextAdvancedTo as number;
};

const getResponseMetadata = ({
	response,
}: {
	response: AttachResponse | undefined;
}) => ({
	invoiceStatus: response?.invoice?.status,
	invoiceTotal: response?.invoice?.total,
	paymentUrlReturned: Boolean(
		response?.payment_url || response?.checkout_url || response?.url,
	),
});

const printFinalTables = ({ scenarios }: { scenarios: ScenarioDef[] }) => {
	const successfulRecords = benchmarkRecords.filter((record) => record.success);
	const scenarioTable = scenarios
		.map((scenario) => {
			const scenarioRecords = successfulRecords.filter(
				(record) =>
					record.scenario === scenario.id && record.phase !== "cohort_setup",
			);
			const stats = summarizeDurations({
				values: scenarioRecords.map((record) => record.durationMs),
			});
			const failures = benchmarkFailures.filter(
				(record) => record.scenario === scenario.id,
			).length;
			return {
				scenario: scenario.id,
				runs: stats.count,
				failures,
				avgMs: stats.avgMs,
				p50Ms: stats.p50Ms,
				p90Ms: stats.p90Ms,
				maxMs: stats.maxMs,
			};
		})
		.sort((a, b) => b.avgMs - a.avgMs);

	const operationNames = Array.from(
		new Set(successfulRecords.map((record) => record.operation)),
	).sort();
	const operationTable = operationNames.map((operation) => {
		const operationRecords = successfulRecords.filter(
			(record) => record.operation === operation,
		);
		const stats = summarizeDurations({
			values: operationRecords.map((record) => record.durationMs),
		});
		return {
			operation,
			count: stats.count,
			avgMs: stats.avgMs,
			p50Ms: stats.p50Ms,
			p90Ms: stats.p90Ms,
			maxMs: stats.maxMs,
		};
	});

	const slowestRuns = [...benchmarkRecords]
		.sort((a, b) => b.durationMs - a.durationMs)
		.slice(0, 10)
		.map((record) => ({
			scenario: record.scenario,
			customerId: record.customerId,
			phase: record.phase,
			operation: record.operation,
			durationMs: record.durationMs,
			invoiceStatus: record.invoiceStatus ?? "-",
			error: record.error ?? "",
		}));

	const failureTable = benchmarkFailures.map((record) => ({
		scenario: record.scenario,
		customerId: record.customerId,
		phase: record.phase,
		operation: record.operation,
		error: record.error ?? "",
	}));

	console.log("\nScenario Summary");
	console.table(scenarioTable);

	console.log("\nOperation Summary");
	console.table(operationTable);

	console.log("\nSlowest Runs");
	console.table(slowestRuns);

	if (failureTable.length > 0) {
		console.log("\nFailures");
		console.table(failureTable);
	}
};

test(`${chalk.yellowBright("benchmark: attach-v2 paid upgrade/downgrade paths")}`, async () => {
	benchmarkRecords.length = 0;
	benchmarkFailures.length = 0;
	completedOperations = 0;
	lastProgressAt = 0;

	const scenarios = buildScenarioDefs();
	const scenariosById = Object.fromEntries(
		scenarios.map((scenario) => [scenario.id, scenario]),
	) as Record<string, ScenarioDef>;

	totalPlannedOperations =
		3 +
		scenarios.length * CONFIG.customersPerScenario +
		3 +
		scenarios.length * CONFIG.customersPerScenario +
		2 +
		CONFIG.customersPerScenario +
		scenarios.length * CONFIG.customersPerScenario;

	console.log("\nAttach V2 paid-path benchmark MVP");
	console.log(
		`Scenarios=${scenarios.length}, customersPerScenario=${CONFIG.customersPerScenario}, totalPlannedOps=${totalPlannedOperations}`,
	);

	const shortRuntime = await setupCohort({
		cohortId: "short",
		scenarios: scenarios.filter((scenario) => scenario.cohortId === "short"),
	});
	const intervalRuntime = await setupCohort({
		cohortId: "interval",
		scenarios: scenarios.filter((scenario) => scenario.cohortId === "interval"),
	});
	const complexRuntime = await setupCohort({
		cohortId: "complex",
		scenarios: scenarios.filter((scenario) => scenario.cohortId === "complex"),
	});

	const runtimes = [
		shortRuntime,
		intervalRuntime,
		complexRuntime,
	] satisfies CohortRuntime[];
	const allCases = runtimes.flatMap((runtime) =>
		runtime.cases.map((benchmarkCase) => ({ runtime, benchmarkCase })),
	);

	await runWithConcurrency({
		items: allCases,
		limit: CONFIG.maxConcurrentOperations,
		fn: async ({ runtime, benchmarkCase }) => {
			const scenario = scenariosById[benchmarkCase.scenarioId];
			const response = await recordOperation({
				scenario: scenario.id,
				customerId: benchmarkCase.customerId,
				cohort: runtime.id,
				phase: "initial_attach",
				operation: "initial_billing_attach",
				fn: async () =>
					runtime.autumnV1.billing.attach(
						{
							customer_id: benchmarkCase.customerId,
							product_id: runtime.productsByKey[scenario.initialProductKey],
							redirect_mode: "if_required",
							options: scenario.initialOptions,
						},
						{ timeout: CONFIG.requestTimeoutMs },
					),
				onSuccess: (result) =>
					getResponseMetadata({ response: result as AttachResponse }),
			});
			if (response) {
				benchmarkCase.responses.push(response as AttachResponse);
			}
		},
	});

	await advanceCohortClock({
		runtime: shortRuntime,
		operation: "advance_short_midcycle",
		note: "14 days",
		numberOfDays: 14,
	});
	await advanceCohortClock({
		runtime: intervalRuntime,
		operation: "advance_interval_window",
		note: "2 months 2 weeks",
		numberOfMonths: 2,
		numberOfWeeks: 2,
	});
	await advanceCohortClock({
		runtime: complexRuntime,
		operation: "advance_complex_midcycle",
		note: "14 days",
		numberOfDays: 14,
	});

	await runWithConcurrency({
		items: allCases,
		limit: CONFIG.maxConcurrentOperations,
		fn: async ({ runtime, benchmarkCase }) => {
			const scenario = scenariosById[benchmarkCase.scenarioId];
			const response = await recordOperation({
				scenario: scenario.id,
				customerId: benchmarkCase.customerId,
				cohort: runtime.id,
				phase: "mutate",
				operation: "mutate_billing_attach",
				fn: async () => {
					await scenario.runMutation({ runtime, benchmarkCase });
					return benchmarkCase.responses[benchmarkCase.responses.length - 1];
				},
				onSuccess: (result) =>
					getResponseMetadata({ response: result as AttachResponse }),
			});
			if (response && (response as AttachResponse).payment_url) {
				// Keep benchmark running, but leave a signal in the note/failures output.
			}
		},
	});

	await advanceCohortClock({
		runtime: shortRuntime,
		operation: "advance_short_post_mutation",
		note: "next invoice",
		toNextInvoice: true,
	});
	await advanceCohortClock({
		runtime: complexRuntime,
		operation: "advance_complex_post_downgrade",
		note: "next invoice",
		toNextInvoice: true,
	});

	const complexCases = complexRuntime.cases.map((benchmarkCase) => ({
		runtime: complexRuntime,
		benchmarkCase,
	}));
	await runWithConcurrency({
		items: complexCases,
		limit: CONFIG.maxConcurrentOperations,
		fn: async ({ runtime, benchmarkCase }) => {
			const scenario = scenariosById[benchmarkCase.scenarioId];
			if (!scenario.runPostAdvanceMutation) return;
			await recordOperation({
				scenario: scenario.id,
				customerId: benchmarkCase.customerId,
				cohort: runtime.id,
				phase: "mutate",
				operation: "mutate_reupgrade_attach",
				fn: async () => {
					await scenario.runPostAdvanceMutation!({ runtime, benchmarkCase });
					return benchmarkCase.responses[benchmarkCase.responses.length - 1];
				},
				onSuccess: (result) =>
					getResponseMetadata({ response: result as AttachResponse }),
			});
		},
	});

	await runWithConcurrency({
		items: allCases,
		limit: CONFIG.maxConcurrentOperations,
		fn: async ({ runtime, benchmarkCase }) => {
			const scenario = scenariosById[benchmarkCase.scenarioId];
			await recordOperation({
				scenario: scenario.id,
				customerId: benchmarkCase.customerId,
				cohort: runtime.id,
				phase: "verify",
				operation: "verify_customer_state",
				fn: async () => {
					const customer = await runtime.autumnV1.customers.get<ApiCustomerV3>(
						benchmarkCase.customerId,
					);
					if (!customer) {
						throw new Error("customer fetch returned empty result");
					}
					if (benchmarkCase.responses.length === 0) {
						throw new Error("scenario produced no attach responses");
					}
					if (
						benchmarkCase.responses.some((response) =>
							Boolean(
								response.payment_url || response.checkout_url || response.url,
							),
						)
					) {
						throw new Error(
							"checkout/payment URL returned in paid-path benchmark",
						);
					}
					await scenario.verify?.({ runtime, benchmarkCase, customer });
					return customer;
				},
			});
		},
	});

	printFinalTables({ scenarios });

	const completedScenarios = benchmarkRecords.filter(
		(record) => record.phase === "verify" && record.success,
	).length;
	if (completedScenarios === 0) {
		throw new Error(
			"benchmark completed with zero successful verify operations",
		);
	}
});
