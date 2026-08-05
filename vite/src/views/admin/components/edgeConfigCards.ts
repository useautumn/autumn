import {
	Activity,
	Clock,
	CreditCard,
	Database,
	Gauge,
	HardDrive,
	Layers,
	ListChecks,
	type LucideIcon,
	RefreshCw,
	Settings2,
	ShieldBan,
	SlidersHorizontal,
	Sparkles,
	TrendingUp,
	UserX,
	Waves,
} from "lucide-react";

export type EdgeConfigCardTone = "neutral" | "active" | "warning";

export type EdgeConfigStatus = {
	label: string;
	tone: EdgeConfigCardTone;
};

export type EdgeConfigCardId =
	| "feature-flags"
	| "async-balance-update"
	| "async-track"
	| "request-block"
	| "customer-block"
	| "org-limits"
	| "rate-limit-overrides"
	| "rate-limit-redis-allowlist"
	| "stripe-sync"
	| "redis-v2-cache"
	| "misc-redis"
	| "cache-v2-ramp"
	| "full-subject-gate"
	| "miscellaneous";

export type QueueCronCardId =
	| "job-queues"
	| "batch-reset-v2"
	| "reset-job"
	| "lazy-batch-resets";

export type EdgeConfigCardDef<Id extends string = EdgeConfigCardId> = {
	id: Id;
	title: string;
	description: string;
	icon: LucideIcon;
	/** Admin GET endpoint used to derive the live status line. */
	endpoint: string;
	/** Collapses a config payload into the one-line state shown on the card. */
	deriveStatus: (data: unknown) => EdgeConfigStatus;
};

export type EdgeConfigSectionDef = {
	id: string;
	title: string;
	description: string;
	cards: EdgeConfigCardDef[];
};

const IDLE: EdgeConfigStatus = { label: "Default", tone: "neutral" };

const asRecord = (data: unknown): Record<string, unknown> =>
	data && typeof data === "object" ? (data as Record<string, unknown>) : {};

const countKeys = (value: unknown): number =>
	value && typeof value === "object" ? Object.keys(value).length : 0;

const pluralize = ({ count, noun }: { count: number; noun: string }): string =>
	`${count} ${noun}${count === 1 ? "" : "s"}`;

const overrideStatus = ({
	count,
	noun,
}: {
	count: number;
	noun: string;
}): EdgeConfigStatus =>
	count === 0
		? { label: "No overrides", tone: "neutral" }
		: { label: pluralize({ count, noun }), tone: "active" };

export const EDGE_CONFIG_SECTIONS: EdgeConfigSectionDef[] = [
	{
		id: "access-control",
		title: "Access Control",
		description: "Block traffic and shape per-org request limits.",
		cards: [
			{
				id: "request-block",
				title: "Request Blocking",
				description: "Block /v1 API requests org-wide or by endpoint pattern.",
				icon: ShieldBan,
				endpoint: "/admin/request-block-config",
				deriveStatus: (data) => {
					const orgs = asRecord(data).orgs;
					const entries = Object.values(asRecord(orgs));
					const blocking = entries.filter((entry) => {
						const record = asRecord(entry);
						return (
							record.blockAll === true ||
							(Array.isArray(record.blockedEndpoints) &&
								record.blockedEndpoints.length > 0)
						);
					}).length;

					return blocking === 0
						? { label: "Nothing blocked", tone: "neutral" }
						: {
								label: `${pluralize({ count: blocking, noun: "org" })} blocked`,
								tone: "warning",
							};
				},
			},
			{
				id: "customer-block",
				title: "Customer Blocking",
				description:
					"Block a specific org, environment, and customer combination.",
				icon: UserX,
				endpoint: "/admin/customer-block-config",
				deriveStatus: (data) => {
					const orgs = asRecord(asRecord(data).orgs);
					let blocked = 0;
					for (const envEntries of Object.values(orgs)) {
						for (const customers of Object.values(asRecord(envEntries))) {
							blocked += countKeys(customers);
						}
					}

					return blocked === 0
						? { label: "Nothing blocked", tone: "neutral" }
						: {
								label: `${pluralize({ count: blocked, noun: "customer" })} blocked`,
								tone: "warning",
							};
				},
			},
			{
				id: "org-limits",
				title: "Org Limits",
				description:
					"Per-org overrides for max customer products and entities.",
				icon: SlidersHorizontal,
				endpoint: "/admin/org-limits-config",
				deriveStatus: (data) =>
					overrideStatus({
						count: countKeys(asRecord(data).orgs),
						noun: "org override",
					}),
			},
			{
				id: "rate-limit-overrides",
				title: "Rate Limit Overrides",
				description:
					"Per-org overrides for any rate-limit bucket (track, check, attach).",
				icon: Gauge,
				endpoint: "/admin/rate-limit-overrides-config",
				deriveStatus: (data) =>
					overrideStatus({
						count: countKeys(asRecord(data).orgs),
						noun: "org override",
					}),
			},
			{
				id: "rate-limit-redis-allowlist",
				title: "Rate Limit Redis Allowlist",
				description:
					"Force Track and Check rate limits through the shared Redis counter.",
				icon: ListChecks,
				endpoint: "/admin/rate-limit-redis-allowlist-config",
				deriveStatus: (data) => {
					const ids = asRecord(data).customerIds;
					const count = Array.isArray(ids) ? ids.length : 0;

					return count === 0
						? { label: "Empty", tone: "neutral" }
						: {
								label: pluralize({ count, noun: "customer" }),
								tone: "active",
							};
				},
			},
		],
	},
	{
		id: "cache-redis",
		title: "Cache & Redis",
		description: "Route cache traffic and gate expensive hydrations.",
		cards: [
			{
				id: "redis-v2-cache",
				title: "V2 Redis Instance",
				description:
					"Switch the active V2 Redis between upstash, redis, and dragonfly.",
				icon: Database,
				endpoint: "/admin/redis-v2-cache-config",
				deriveStatus: (data) => {
					const active = asRecord(data).activeInstance;
					if (typeof active !== "string") return IDLE;

					return {
						label: active,
						tone: active === "dragonfly" ? "neutral" : "warning",
					};
				},
			},
			{
				id: "misc-redis",
				title: "Misc Redis",
				description:
					"Active misc-cache instance, migration ramp, and encrypted backup destination.",
				icon: HardDrive,
				endpoint: "/admin/misc-redis-config",
				deriveStatus: (data) => {
					const record = asRecord(data);
					const active = record.activeInstance;
					if (typeof active !== "string") return IDLE;

					if (record.ramp) {
						const ramp = asRecord(record.ramp);
						const target = active === "main" ? "backup" : "main";
						return {
							label: `${active} · ${ramp.percent ?? 0}% → ${target}`,
							tone: "warning",
						};
					}

					return {
						label: active,
						tone: active === "main" ? "neutral" : "warning",
					};
				},
			},
			{
				id: "cache-v2-ramp",
				title: "Cache V2 Ramp",
				description:
					"Global percentage ramp routing customer cache traffic to a new V2 Redis.",
				icon: TrendingUp,
				endpoint: "/admin/cache-v2-ramp",
				deriveStatus: (data) => {
					const ramp = asRecord(data).cache_v2_ramp;
					if (!ramp) return { label: "Not configured", tone: "neutral" };

					const percent = asRecord(ramp).migrationPercent;
					const value = typeof percent === "number" ? percent : 0;

					return value === 0
						? { label: "Configured, 0%", tone: "neutral" }
						: { label: `${value}% ramped`, tone: "active" };
				},
			},
			{
				id: "full-subject-gate",
				title: "FullSubject Concurrency Gate",
				description:
					"Per-customer and per-org caps on concurrent FullSubject DB hydrations.",
				icon: Layers,
				endpoint: "/admin/full-subject-gate-config",
				deriveStatus: (data) => {
					const config = asRecord(data);
					const perCustomer = config.per_customer_limit;
					const perOrg = config.per_org_limit;
					if (typeof perCustomer !== "number" || typeof perOrg !== "number") {
						return IDLE;
					}

					return {
						label: `${perCustomer} / ${perOrg} concurrent`,
						tone: "neutral",
					};
				},
			},
		],
	},
	{
		id: "rollouts-flags",
		title: "Rollouts & Flags",
		description: "Global gates and incremental feature enablement.",
		cards: [
			{
				id: "async-balance-update",
				title: "Async Balance Updates",
				description:
					"Enqueue balances.update calls for background processing by org.",
				icon: Clock,
				endpoint: "/admin/async-balance-update-config",
				deriveStatus: (data) => {
					const ids = asRecord(data).enabledOrgIds;
					const count = Array.isArray(ids) ? ids.length : 0;

					return count === 0
						? { label: "No orgs enabled", tone: "neutral" }
						: {
								label: `${pluralize({ count, noun: "org" })} enabled`,
								tone: "active",
							};
				},
			},
			{
				id: "async-track",
				title: "Async Track",
				description: "Enqueue Track requests for background processing by org.",
				icon: Waves,
				endpoint: "/admin/async-track-config",
				deriveStatus: (data) => {
					const ids = asRecord(data).enabledOrgIds;
					const count = Array.isArray(ids) ? ids.length : 0;

					return count === 0
						? { label: "No orgs enabled", tone: "neutral" }
						: {
								label: `${pluralize({ count, noun: "org" })} enabled`,
								tone: "active",
							};
				},
			},
			{
				id: "feature-flags",
				title: "Feature Flags",
				description: "Toggle maintenance modes and feature gates globally.",
				icon: Activity,
				endpoint: "/admin/feature-flags-config",
				deriveStatus: (data) => {
					const config = asRecord(data);
					const analytics = asRecord(
						asRecord(config.maintenanceModes).analytics,
					);
					const orgsWithOverage = countKeys(config.disableOverageBillingFlags);
					const parts: string[] = [];

					if (analytics.disableRevenueMetrics === true) {
						parts.push("Revenue metrics off");
					}
					if (orgsWithOverage > 0) {
						parts.push(
							`${pluralize({ count: orgsWithOverage, noun: "overage org" })}`,
						);
					}

					return parts.length === 0
						? { label: "No flags set", tone: "neutral" }
						: { label: parts.join(" | "), tone: "warning" };
				},
			},
			{
				id: "miscellaneous",
				title: "Miscellaneous",
				description:
					"Catch-all rollout switches, including the flat customer-model allowlist.",
				icon: Settings2,
				endpoint: "/admin/miscellaneous-edge-config",
				deriveStatus: (data) => {
					const config = asRecord(data);
					const allowlist = config.newFlatCusModel;
					const allowlistCount = Array.isArray(allowlist)
						? allowlist.length
						: 0;
					const parts: string[] = [];

					if (config.syncCoalesce === true) parts.push("Sync coalesce on");
					if (allowlistCount > 0) {
						parts.push(
							`${pluralize({ count: allowlistCount, noun: "flat-model customer" })}`,
						);
					}

					return parts.length === 0
						? { label: "Defaults", tone: "neutral" }
						: { label: parts.join(" | "), tone: "active" };
				},
			},
		],
	},
	{
		id: "integrations",
		title: "Integrations",
		description: "Third-party sync behaviour.",
		cards: [
			{
				id: "stripe-sync",
				title: "Stripe Sync",
				description:
					"Enable Stripe webhook event syncing to the sync DB per org.",
				icon: CreditCard,
				endpoint: "/admin/stripe-sync-config",
				deriveStatus: (data) => {
					const ids = asRecord(data).enabledOrgIds;
					const count = Array.isArray(ids) ? ids.length : 0;

					return count === 0
						? { label: "No orgs enabled", tone: "neutral" }
						: {
								label: `${pluralize({ count, noun: "org" })} enabled`,
								tone: "active",
							};
				},
			},
		],
	},
];

const enabledStatus = ({
	data,
	onLabel,
	offLabel,
}: {
	data: unknown;
	onLabel: string;
	offLabel: string;
}): EdgeConfigStatus =>
	asRecord(data).enabled === true
		? { label: onLabel, tone: "active" }
		: { label: offLabel, tone: "warning" };

export const QUEUE_CRON_CARDS: EdgeConfigCardDef<QueueCronCardId>[] = [
	{
		id: "job-queues",
		title: "Job Queues",
		description:
			"Pause or resume worker consumption for shared and dedicated SQS queues.",
		icon: Waves,
		endpoint: "/admin/job-queue-config",
		deriveStatus: (data) => {
			const entries = Object.values(asRecord(asRecord(data).queues));
			const paused = entries.filter(
				(entry) => asRecord(entry).enabled === false,
			).length;

			return paused === 0
				? { label: "All active", tone: "neutral" }
				: {
						label: `${pluralize({ count: paused, noun: "queue" })} paused`,
						tone: "warning",
					};
		},
	},
	{
		id: "batch-reset-v2",
		title: "Batch Reset V2",
		description:
			"Scan overdue customer entitlements and fan them out to reset workers.",
		icon: RefreshCw,
		endpoint: "/admin/reset-job-v2-config",
		deriveStatus: (data) => {
			const config = asRecord(data);
			if (config.enabled !== true) return { label: "Stopped", tone: "warning" };

			const scanBatchSize = config.scanBatchSize;
			return {
				label:
					typeof scanBatchSize === "number"
						? `Running, scan ${scanBatchSize}`
						: "Running",
				tone: "active",
			};
		},
	},
	{
		id: "reset-job",
		title: "Reset Job",
		description:
			"Continuously reset due balances in small, serialized batches.",
		icon: Clock,
		endpoint: "/admin/reset-job-config",
		deriveStatus: (data) => {
			const config = asRecord(data);
			if (config.enabled !== true) return { label: "Stopped", tone: "warning" };

			const batchSize = config.batchSize;
			return {
				label:
					typeof batchSize === "number"
						? `Running, batch ${batchSize}`
						: "Running",
				tone: "active",
			};
		},
	},
	{
		id: "lazy-batch-resets",
		title: "Lazy Batch Resets",
		description:
			"Control lazy entitlement repairs scheduled by customer and entity list requests.",
		icon: Sparkles,
		endpoint: "/admin/batch-reset-config",
		deriveStatus: (data) =>
			enabledStatus({ data, onLabel: "Enabled", offLabel: "Disabled" }),
	},
];
