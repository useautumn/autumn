import { Button } from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CacheV2RampDialog } from "./CacheV2RampDialog";
import { CustomerBlockDialog } from "./CustomerBlockDialog";
import { EdgeConfigDialog } from "./EdgeConfigDialog";
import { FeatureFlagsDialog } from "./FeatureFlagsDialog";
import { FullSubjectGateDialog } from "./FullSubjectGateDialog";
import { JobQueuesDialog } from "./JobQueuesDialog";
import { MiscellaneousEdgeConfigDialog } from "./MiscellaneousEdgeConfigDialog";
import { OrgLimitsDialog } from "./OrgLimitsDialog";
import { RateLimitOverridesDialog } from "./RateLimitOverridesDialog";
import { RateLimitRedisAllowlistDialog } from "./RateLimitRedisAllowlistDialog";
import { RawEdgeConfigDialog } from "./RawEdgeConfigDialog";
import { RedisV2CacheDialog } from "./RedisV2CacheDialog";
import { ResetJobToggle } from "./ResetJobToggle";
import { StripeSyncDialog } from "./StripeSyncDialog";

type EdgeConfigSource = {
	bucket: string;
	region: string;
	configs: {
		id: string;
		label: string;
		key: string;
	}[];
};

export function EdgeConfigTab() {
	const axiosInstance = useAxiosInstance();
	const [requestBlockEditOpen, setRequestBlockEditOpen] = useState(false);
	const [requestBlockRawOpen, setRequestBlockRawOpen] = useState(false);
	const [featureFlagsOpen, setFeatureFlagsOpen] = useState(false);
	const [customerBlockOpen, setCustomerBlockOpen] = useState(false);
	const [orgLimitsOpen, setOrgLimitsOpen] = useState(false);
	const [rateLimitOverridesOpen, setRateLimitOverridesOpen] = useState(false);
	const [rateLimitRedisAllowlistOpen, setRateLimitRedisAllowlistOpen] =
		useState(false);
	const [jobQueuesOpen, setJobQueuesOpen] = useState(false);
	const [stripeSyncOpen, setStripeSyncOpen] = useState(false);
	const [redisV2CacheOpen, setRedisV2CacheOpen] = useState(false);
	const [cacheV2RampOpen, setCacheV2RampOpen] = useState(false);
	const [miscellaneousOpen, setMiscellaneousOpen] = useState(false);
	const [fullSubjectGateOpen, setFullSubjectGateOpen] = useState(false);

	const { data: source } = useQuery<EdgeConfigSource>({
		queryKey: ["admin-edge-config-sources"],
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/edge-config-sources");
			return data;
		},
	});

	return (
		<div className="flex flex-col gap-4">
			{source && (
				<div className="rounded-lg border border-border bg-muted/20 p-4">
					<div className="grid gap-3 md:grid-cols-[220px_160px_minmax(0,1fr)]">
						<div>
							<div className="text-[11px] font-medium uppercase text-tertiary-foreground">
								S3 Bucket
							</div>
							<div className="mt-1 font-mono text-xs text-foreground">
								{source.bucket}
							</div>
						</div>
						<div>
							<div className="text-[11px] font-medium uppercase text-tertiary-foreground">
								Region
							</div>
							<div className="mt-1 font-mono text-xs text-foreground">
								{source.region}
							</div>
						</div>
						<div className="min-w-0">
							<div className="text-[11px] font-medium uppercase text-tertiary-foreground">
								Config Objects
							</div>
							<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
								{source.configs.map((config) => (
									<span
										key={config.id}
										className="min-w-0 text-xs text-muted-foreground"
										title={config.key}
									>
										<span className="text-tertiary-foreground">
											{config.label}:
										</span>{" "}
										<span className="font-mono">{config.key}</span>
									</span>
								))}
							</div>
						</div>
					</div>
				</div>
			)}

			<div className="rounded-lg border border-border overflow-hidden">
				<div className="flex items-center justify-between p-4 border-b border-border">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-foreground">
							Feature Flags
						</div>
						<div className="text-xs text-tertiary-foreground">
							Toggle maintenance modes and feature gates globally.
						</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => setFeatureFlagsOpen(true)}
					>
						Edit
					</Button>
				</div>

				<div className="flex items-center justify-between p-4 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-foreground">
							Request Blocking
						</div>
						<div className="text-xs text-tertiary-foreground">
							Block /v1 API requests org-wide or by endpoint pattern.
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="secondary"
							size="sm"
							onClick={() => setRequestBlockRawOpen(true)}
						>
							Raw Edit
						</Button>
						<Button
							variant="primary"
							size="sm"
							onClick={() => setRequestBlockEditOpen(true)}
						>
							Edit
						</Button>
					</div>
				</div>

				<div className="flex items-center justify-between border-t border-border p-4 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-foreground">
							Customer Blocking
						</div>
						<div className="text-xs text-tertiary-foreground">
							Block a specific org, environment, and customer combination after
							customer ID resolution.
						</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => setCustomerBlockOpen(true)}
					>
						Edit
					</Button>
				</div>

				<div className="flex items-center justify-between border-t border-border p-4 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-foreground">
							Org Limits
						</div>
						<div className="text-xs text-tertiary-foreground">
							Per-org overrides for max customer products returned in queries
							(default 15).
						</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => setOrgLimitsOpen(true)}
					>
						Edit
					</Button>
				</div>

				<div className="flex items-center justify-between border-t border-border p-4 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-foreground">
							Rate Limit Overrides
						</div>
						<div className="text-xs text-tertiary-foreground">
							Per-org overrides for any rate-limit bucket (track, check, attach,
							customer_entities_get, etc.).
						</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => setRateLimitOverridesOpen(true)}
					>
						Edit
					</Button>
				</div>

				<div className="flex items-center justify-between border-t border-border p-4 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-foreground">
							Rate Limit Redis Allowlist
						</div>
						<div className="text-xs text-tertiary-foreground">
							Per-customer allowlist that forces Track and Check rate limits
							through the shared Redis counter instead of the in-memory per-task
							counter. Use for strict global enforcement on high-volume
							customers.
						</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => setRateLimitRedisAllowlistOpen(true)}
					>
						Edit
					</Button>
				</div>

				<div className="flex items-center justify-between border-t border-border p-4 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-foreground">
							Job Queues
						</div>
						<div className="text-xs text-tertiary-foreground">
							Pause or resume worker consumption for shared and dedicated SQS
							queues.
						</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => setJobQueuesOpen(true)}
					>
						Edit
					</Button>
				</div>

				<div className="flex items-center justify-between border-t border-border p-4 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-foreground">Reset Job</div>
						<div className="text-xs text-tertiary-foreground">
							Continuously resets due balances in small, serialized batches.
						</div>
					</div>
					<ResetJobToggle />
				</div>

				<div className="flex items-center justify-between border-t border-border p-4 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-foreground">
							Stripe Sync
						</div>
						<div className="text-xs text-tertiary-foreground">
							Enable Stripe webhook event syncing to the sync DB per org.
						</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => setStripeSyncOpen(true)}
					>
						Edit
					</Button>
				</div>

				<div className="flex items-center justify-between border-t border-border p-4 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-foreground">
							V2 Redis Instance
						</div>
						<div className="text-xs text-tertiary-foreground">
							Switch the active V2 Redis between upstash, redis, and dragonfly
							at runtime.
						</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => setRedisV2CacheOpen(true)}
					>
						Edit
					</Button>
				</div>

				<div className="flex items-center justify-between border-t border-border p-4 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-foreground">
							Cache V2 Ramp
						</div>
						<div className="text-xs text-tertiary-foreground">
							Global percentage ramp routing customer cache traffic to a new V2
							Redis destination. Only active while dragonfly is the V2 instance.
						</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => setCacheV2RampOpen(true)}
					>
						Edit
					</Button>
				</div>

				<div className="flex items-center justify-between border-t border-border p-4 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-foreground">
							FullSubject Concurrency Gate
						</div>
						<div className="text-xs text-tertiary-foreground">
							Per-customer + per-org caps on concurrent FullSubject DB
							hydrations. 429s with rate_limit_exceeded when queues/waits exceed
							thresholds.
						</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => setFullSubjectGateOpen(true)}
					>
						Edit
					</Button>
				</div>

				<div className="flex items-center justify-between border-t border-border p-4 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-foreground">
							Miscellaneous
						</div>
						<div className="text-xs text-tertiary-foreground">
							Catch-all rollout switches. Includes the new flat customer-model
							allowlist for the faster set-based getFull query.
						</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => setMiscellaneousOpen(true)}
					>
						Edit
					</Button>
				</div>
			</div>

			<FeatureFlagsDialog
				open={featureFlagsOpen}
				onOpenChange={setFeatureFlagsOpen}
			/>

			<CustomerBlockDialog
				open={customerBlockOpen}
				onOpenChange={setCustomerBlockOpen}
			/>

			<EdgeConfigDialog
				open={requestBlockEditOpen}
				onOpenChange={(open) => {
					if (!open) setRequestBlockEditOpen(false);
				}}
			/>

			<RawEdgeConfigDialog
				open={requestBlockRawOpen}
				onOpenChange={setRequestBlockRawOpen}
				configId="request-block"
			/>

			<OrgLimitsDialog open={orgLimitsOpen} onOpenChange={setOrgLimitsOpen} />

			<RateLimitOverridesDialog
				open={rateLimitOverridesOpen}
				onOpenChange={setRateLimitOverridesOpen}
			/>

			<RateLimitRedisAllowlistDialog
				open={rateLimitRedisAllowlistOpen}
				onOpenChange={setRateLimitRedisAllowlistOpen}
			/>

			<JobQueuesDialog open={jobQueuesOpen} onOpenChange={setJobQueuesOpen} />

			<StripeSyncDialog
				open={stripeSyncOpen}
				onOpenChange={setStripeSyncOpen}
			/>

			<RedisV2CacheDialog
				open={redisV2CacheOpen}
				onOpenChange={setRedisV2CacheOpen}
			/>

			<CacheV2RampDialog
				open={cacheV2RampOpen}
				onOpenChange={setCacheV2RampOpen}
			/>

			<MiscellaneousEdgeConfigDialog
				open={miscellaneousOpen}
				onOpenChange={setMiscellaneousOpen}
			/>

			<FullSubjectGateDialog
				open={fullSubjectGateOpen}
				onOpenChange={setFullSubjectGateOpen}
			/>
		</div>
	);
}
