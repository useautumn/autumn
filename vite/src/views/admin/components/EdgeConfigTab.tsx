import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CustomerBlockDialog } from "./CustomerBlockDialog";
import { EdgeConfigDialog } from "./EdgeConfigDialog";
import { FeatureFlagsDialog } from "./FeatureFlagsDialog";
import { JobQueuesDialog } from "./JobQueuesDialog";
import { OrgLimitsDialog } from "./OrgLimitsDialog";
import { RawEdgeConfigDialog } from "./RawEdgeConfigDialog";
import { RedisV2CacheDialog } from "./RedisV2CacheDialog";
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
	const [jobQueuesOpen, setJobQueuesOpen] = useState(false);
	const [stripeSyncOpen, setStripeSyncOpen] = useState(false);
	const [redisV2CacheOpen, setRedisV2CacheOpen] = useState(false);

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
							<div className="text-[11px] font-medium uppercase text-t3">
								S3 Bucket
							</div>
							<div className="mt-1 font-mono text-xs text-t1">
								{source.bucket}
							</div>
						</div>
						<div>
							<div className="text-[11px] font-medium uppercase text-t3">
								Region
							</div>
							<div className="mt-1 font-mono text-xs text-t1">
								{source.region}
							</div>
						</div>
						<div className="min-w-0">
							<div className="text-[11px] font-medium uppercase text-t3">
								Config Objects
							</div>
							<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
								{source.configs.map((config) => (
									<span
										key={config.id}
										className="min-w-0 text-xs text-t2"
										title={config.key}
									>
										<span className="text-t3">{config.label}:</span>{" "}
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
						<div className="text-sm font-medium text-t1">Feature Flags</div>
						<div className="text-xs text-t3">
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
						<div className="text-sm font-medium text-t1">Request Blocking</div>
						<div className="text-xs text-t3">
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
						<div className="text-sm font-medium text-t1">Customer Blocking</div>
						<div className="text-xs text-t3">
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
						<div className="text-sm font-medium text-t1">Org Limits</div>
						<div className="text-xs text-t3">
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
						<div className="text-sm font-medium text-t1">Job Queues</div>
						<div className="text-xs text-t3">
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
						<div className="text-sm font-medium text-t1">Stripe Sync</div>
						<div className="text-xs text-t3">
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
						<div className="text-sm font-medium text-t1">V2 Redis Instance</div>
						<div className="text-xs text-t3">
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

			<JobQueuesDialog
				open={jobQueuesOpen}
				onOpenChange={setJobQueuesOpen}
			/>

			<StripeSyncDialog
				open={stripeSyncOpen}
				onOpenChange={setStripeSyncOpen}
			/>

			<RedisV2CacheDialog
				open={redisV2CacheOpen}
				onOpenChange={setRedisV2CacheOpen}
			/>
		</div>
	);
}
