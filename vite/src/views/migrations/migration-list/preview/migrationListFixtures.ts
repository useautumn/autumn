import {
	AppEnv,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type MigrationFilter,
	type MigrationListItemCounts,
	type MigrationListSummary,
	type MigrationStatus,
	type Operations,
} from "@autumn/shared";
import type { MigrationWithRunInfo } from "@/hooks/queries/useMigrationsQuery";
import {
	createMigrationCatalog,
	type MigrationListRow,
	toMigrationListRows,
} from "../rowView/deriveMigrationRowView";

export const CACHE_INVALIDATION_ERROR_MESSAGE =
	"Error in run-batch-migration-chunk: batch-migration: cache invalidation did not complete for 1 page(s) (0 timed out; page 1); checkpoints revoked for retry where the revoke succeeded (see per-page logs)";

export const FIXTURE_NOW = new Date(2026, 8, 29, 12, 0).getTime();

const MINUTE = 60_000;
const minutesAgo = (minutes: number) => FIXTURE_NOW - minutes * MINUTE;
const on = ({
	day,
	hour = 10,
	minute = 0,
}: {
	day: number;
	hour?: number;
	minute?: number;
}) => new Date(2026, 8, day, hour, minute).getTime();

const fixtureProducts = [
	{ id: "pro", name: "Pro" },
	{ id: "pro_annual", name: "Pro Annual" },
	{ id: "enterprise", name: "Enterprise" },
	{ id: "growth", name: "Growth" },
	{ id: "starter", name: "Starter" },
	{ id: "hobby", name: "Hobby" },
	{ id: "free", name: "Free" },
	{ id: "team", name: "Team" },
	{ id: "business", name: "Business" },
	{ id: "analytics_addon", name: "Analytics add-on" },
	{ id: "seat_license", name: "Seat license" },
	{ id: "hobby_10k", name: "Hobby (10k credits/month)" },
	{ id: "hobby_25k", name: "Hobby (25k credits/month)" },
	{ id: "hobby_50k", name: "Hobby (50k credits/month)" },
	{ id: "hobby_100k", name: "Hobby (100k credits/month)" },
	{ id: "enterprise_1m", name: "Enterprise (1M credits/month)" },
	{ id: "enterprise_3m", name: "Enterprise (3M credits/month)" },
	{ id: "enterprise_7m", name: "Enterprise (7M credits/month, billed yearly)" },
	{
		id: "enterprise_10m",
		name: "Enterprise (10M credits/month, billed yearly)",
	},
];

export const TEN_PLAN_VARIANTS = [
	"hobby",
	"hobby_10k",
	"hobby_25k",
	"hobby_50k",
	"hobby_100k",
	"enterprise",
	"enterprise_1m",
	"enterprise_3m",
	"enterprise_7m",
	"enterprise_10m",
];

const feature = ({
	id,
	name,
	type,
	usageType,
}: {
	id: string;
	name: string;
	type: FeatureType;
	usageType?: FeatureUsageType;
}) =>
	({
		id,
		name,
		type,
		config: usageType ? { usage_type: usageType } : {},
	}) as Feature;

const fixtureFeatures: Feature[] = [
	feature({
		id: "api_calls",
		name: "API calls",
		type: FeatureType.Metered,
		usageType: FeatureUsageType.Single,
	}),
	feature({
		id: "ai_credits",
		name: "AI credits",
		type: FeatureType.AiCreditSystem,
	}),
	feature({
		id: "seats",
		name: "Seats",
		type: FeatureType.Metered,
		usageType: FeatureUsageType.Continuous,
	}),
	feature({ id: "sso", name: "SSO", type: FeatureType.Boolean }),
	feature({ id: "narration", name: "Narration", type: FeatureType.Boolean }),
	feature({
		id: "credits",
		name: "Credits",
		type: FeatureType.CreditSystem,
	}),
];

const counts = (
	partial: Partial<MigrationListItemCounts>,
): MigrationListItemCounts => {
	const filled = {
		running: 0,
		succeeded: 0,
		no_updates_needed: 0,
		ineligible: 0,
		failed: 0,
		...partial,
	};
	return {
		...filled,
		total:
			partial.total ??
			filled.running +
				filled.succeeded +
				filled.no_updates_needed +
				filled.ineligible +
				filled.failed,
	};
};

const summary = (
	partial: Partial<MigrationListSummary>,
): MigrationListSummary => ({
	customer_count: null,
	latest_run: null,
	latest_dry_run: null,
	latest_sample: null,
	queue_position: null,
	last_activity: { kind: "created", at: minutesAgo(60) },
	...partial,
});

const migration = ({
	id,
	status,
	filter = null,
	operations = null,
	noBillingChanges = false,
	runSummary,
}: {
	id: string;
	status: MigrationStatus;
	filter?: MigrationFilter | null;
	operations?: Operations | null;
	noBillingChanges?: boolean;
	runSummary: MigrationListSummary;
}): MigrationWithRunInfo => ({
	internal_id: `mig_${id}`,
	id,
	org_id: "org_fixture",
	env: AppEnv.Sandbox,
	filter,
	operations,
	prepared_state: null,
	no_billing_changes: noBillingChanges,
	retry_failed: false,
	archived: false,
	created_at: runSummary.last_activity.at,
	updated_at: null,
	status,
	blocked_by: status === "waiting" ? "migration-pro-v3-rollout" : null,
	has_live_runs: status !== "draft",
	batch_eligible: false,
	summary: runSummary,
});

export const fixtureMigrations: MigrationWithRunInfo[] = [
	migration({
		id: "migration-pro-v3-rollout",
		status: "running",
		filter: {
			customer: {
				customer_id: { $nin: ["cus_fixture_1", "cus_fixture_2"] },
				$or: [
					{
						plan: {
							$or: [
								{ plan_id: "pro", version: 1 },
								{ plan_id: "pro", version: 2 },
							],
							paid: true,
							price: { $ne: null },
						},
					},
					{ plan: { custom: true } },
				],
			},
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: "pro" },
					version: 3,
					customize: {
						price: { amount: 129, interval: "month" },
						previous_price: { amount: 99, interval: "month" },
						add_items: [
							{
								feature_id: "api_calls",
								included: 10_000,
								reset: { interval: "month" },
							},
						],
						remove_items: [{ feature_id: "sso" }],
					},
				},
				{ type: "add_plan", plan_id: "analytics_addon" },
			],
		} as Operations,
		runSummary: summary({
			customer_count: 1248,
			latest_run: {
				status: "running",
				started_at: minutesAgo(12),
				finished_at: null,
				error_message: null,
				error_code: null,
				counts: counts({
					succeeded: 280,
					no_updates_needed: 20,
					ineligible: 4,
					failed: 8,
					running: 24,
				}),
			},
			last_activity: { kind: "started", at: minutesAgo(12) },
		}),
	}),
	migration({
		id: "migration-enterprise-seats",
		status: "waiting",
		filter: {
			customer: {
				customer_id: {
					$in: ["cus_fixture_a", "cus_fixture_b", "cus_fixture_c"],
				},
			},
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: "enterprise" },
					customize: {
						upsert_licenses: [{ license_plan_id: "seat_license" }],
						add_items: [
							{
								feature_id: "ai_credits",
								included: 500,
								reset: { interval: "month" },
							},
						],
					},
				},
			],
		} as Operations,
		runSummary: summary({
			customer_count: 86,
			latest_run: {
				status: "queued",
				started_at: null,
				finished_at: null,
				error_message: null,
				error_code: null,
				counts: counts({}),
			},
			queue_position: 1,
			last_activity: { kind: "queued", at: minutesAgo(4) },
		}),
	}),
	migration({
		id: "migration-a7k",
		status: "draft",
		runSummary: summary({
			last_activity: { kind: "created", at: on({ day: 27 }) },
		}),
	}),
	migration({
		id: "migration-growth-annual",
		status: "draft",
		filter: { customer: { plan: { plan_id: "growth", recurring: true } } },
		runSummary: summary({
			customer_count: 412,
			last_activity: { kind: "edited", at: on({ day: 26 }) },
		}),
	}),
	migration({
		id: "migration-starter-dry",
		status: "draft",
		filter: {
			customer: {
				plan: { plan_id: "starter", version: 1, price: { $ne: null } },
			},
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: "starter" },
					version: 2,
				},
			],
		} as Operations,
		noBillingChanges: true,
		runSummary: summary({
			customer_count: 1020,
			latest_dry_run: {
				status: "succeeded",
				finished_at: on({ day: 25, minute: 14 }),
				previewed: 60,
				would_change: 57,
				would_fail: 3,
			},
			last_activity: { kind: "dry_run", at: on({ day: 25, minute: 14 }) },
		}),
	}),
	migration({
		id: "migration-hobby-backfill",
		status: "draft",
		filter: { customer: { plan: { $none: {} } } },
		operations: {
			customer: [{ type: "add_plan", plan_id: "hobby" }],
		} as Operations,
		noBillingChanges: true,
		runSummary: summary({
			customer_count: 3120,
			latest_sample: {
				status: "succeeded",
				size: 10,
				finished_at: on({ day: 24 }),
			},
			last_activity: { kind: "sample", at: on({ day: 24 }) },
		}),
	}),
	migration({
		id: "migration-legacy-free-to-hobby",
		status: "run",
		filter: {
			customer: {
				$and: [
					{ plan: { $none: { plan_id: "pro" } } },
					{ plan: { paid: false } },
				],
			},
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: "free" },
					version: 2,
					customize: {
						add_items: [
							{
								feature_id: "api_calls",
								included: 1000,
								reset: { interval: "month" },
							},
						],
					},
				},
			],
		} as Operations,
		noBillingChanges: true,
		runSummary: summary({
			customer_count: 3400,
			latest_run: {
				status: "succeeded",
				started_at: on({ day: 22, minute: 2 }),
				finished_at: on({ day: 22, minute: 40 }),
				error_message: null,
				error_code: null,
				counts: counts({ succeeded: 3391, ineligible: 9 }),
			},
			last_activity: { kind: "finished", at: on({ day: 22, minute: 40 }) },
		}),
	}),
	migration({
		id: "migration-seat-licenses",
		status: "run",
		filter: { customer: { plan: { paid: true, recurring: true } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: { $in: ["team", "business"] } },
					customize: { add_items: [{ feature_id: "seats", included: 5 }] },
				},
			],
		} as Operations,
		runSummary: summary({
			customer_count: 1000,
			latest_run: {
				status: "succeeded",
				started_at: on({ day: 4, minute: 1 }),
				finished_at: on({ day: 4, minute: 12 }),
				error_message: null,
				error_code: null,
				counts: counts({ succeeded: 998, failed: 2 }),
			},
			last_activity: { kind: "finished", at: on({ day: 4, minute: 12 }) },
		}),
	}),
	migration({
		id: "migration-api-credits-topup",
		status: "no_changes",
		filter: {
			customer: {
				plan: { plan_id: { $in: ["pro", "pro_annual"] }, custom: false },
			},
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: { $in: ["pro", "pro_annual"] } },
					customize: {
						add_items: [
							{
								feature_id: "ai_credits",
								included: 500,
								reset: { interval: "month" },
							},
						],
					},
				},
			],
		} as Operations,
		noBillingChanges: true,
		runSummary: summary({
			customer_count: 540,
			latest_run: {
				status: "no_changes",
				started_at: on({ day: 18, minute: 1 }),
				finished_at: on({ day: 18, minute: 6 }),
				error_message: null,
				error_code: null,
				counts: counts({ no_updates_needed: 540 }),
			},
			last_activity: { kind: "finished", at: on({ day: 18, minute: 6 }) },
		}),
	}),
	migration({
		id: "migration-annual-cleanup",
		status: "canceled",
		filter: { customer: { plan: { price: null } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: "pro_annual" },
					customize: { remove_items: [{ feature_id: "sso" }] },
				},
			],
		} as Operations,
		runSummary: summary({
			customer_count: 900,
			latest_run: {
				status: "canceled",
				started_at: on({ day: 10, minute: 0 }),
				finished_at: on({ day: 10, minute: 7 }),
				error_message: null,
				error_code: null,
				counts: counts({ succeeded: 120 }),
			},
			last_activity: { kind: "canceled", at: on({ day: 10, minute: 7 }) },
		}),
	}),
	migration({
		id: "migration-starter-v2",
		status: "failed",
		filter: {
			customer: {
				$or: [{ plan: { plan_id: "starter" } }, { plan: { $none: {} } }],
			},
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: "starter" },
					version: 2,
					customize: {
						price: { amount: 49, interval: "month" },
						previous_price: { amount: 39, interval: "month" },
						add_items: [
							{
								feature_id: "api_calls",
								included: 5000,
								reset: { interval: "month" },
							},
						],
						remove_items: [{ feature_id: "sso" }],
					},
				},
			],
		} as Operations,
		runSummary: summary({
			customer_count: 1020,
			latest_run: {
				status: "failed",
				started_at: on({ day: 15, hour: 14, minute: 14 }),
				finished_at: on({ day: 15, hour: 14, minute: 32 }),
				error_message: "Stripe rate limit exceeded",
				error_code: "stripe_error",
				counts: counts({ succeeded: 798, failed: 14 }),
			},
			last_activity: {
				kind: "failed",
				at: on({ day: 15, hour: 14, minute: 32 }),
			},
		}),
	}),
	migration({
		id: "migration-credits-reset",
		status: "failed",
		filter: { customer: { plan: { plan_id: "growth" } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: "growth" },
					customize: {
						add_items: [
							{
								feature_id: "credits",
								included: 2000,
								reset: { interval: "month" },
							},
						],
					},
				},
			],
		} as Operations,
		runSummary: summary({
			customer_count: 904,
			latest_run: {
				status: "failed",
				started_at: on({ day: 24, hour: 9, minute: 2 }),
				finished_at: on({ day: 24, hour: 9, minute: 9 }),
				error_message: CACHE_INVALIDATION_ERROR_MESSAGE,
				error_code: "cache_invalidation_incomplete",
				counts: counts({ failed: 881 }),
			},
			last_activity: {
				kind: "failed",
				at: on({ day: 24, hour: 9, minute: 9 }),
			},
		}),
	}),
	migration({
		id: "migration-plan-variants",
		status: "run",
		filter: { customer: { plan: { plan_id: { $in: TEN_PLAN_VARIANTS } } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: { $in: TEN_PLAN_VARIANTS } },
					customize: {
						add_items: [
							{ feature_id: "narration", included: 0 },
							{
								feature_id: "credits",
								included: 0,
								reset: { interval: "one_off" },
							},
						],
					},
				},
			],
		} as Operations,
		runSummary: summary({
			customer_count: 1131,
			latest_run: {
				status: "succeeded",
				started_at: on({ day: 20, hour: 17, minute: 59 }),
				finished_at: on({ day: 20, hour: 18, minute: 2 }),
				error_message: null,
				error_code: null,
				counts: counts({ succeeded: 884, ineligible: 1, failed: 1 }),
			},
			last_activity: {
				kind: "finished",
				at: on({ day: 20, hour: 18, minute: 2 }),
			},
		}),
	}),
];

export const fixtureCatalog = createMigrationCatalog({
	products: fixtureProducts,
	features: fixtureFeatures,
	currency: "USD",
});

export const fixtureRows: MigrationListRow[] = toMigrationListRows({
	migrations: fixtureMigrations,
	catalog: fixtureCatalog,
	now: FIXTURE_NOW,
});
