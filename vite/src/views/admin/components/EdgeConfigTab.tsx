import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CacheV2RampDialog } from "./CacheV2RampDialog";
import { CustomerBlockDialog } from "./CustomerBlockDialog";
import { EdgeConfigCard } from "./EdgeConfigCard";
import { EdgeConfigDialog } from "./EdgeConfigDialog";
import { EDGE_CONFIG_SECTIONS, type EdgeConfigCardId } from "./edgeConfigCards";
import { FeatureFlagsDialog } from "./FeatureFlagsDialog";
import { FullSubjectGateDialog } from "./FullSubjectGateDialog";
import { MainRedisCacheDialog } from "./MainRedisCacheDialog";
import { MiscellaneousEdgeConfigDialog } from "./MiscellaneousEdgeConfigDialog";
import { OrgLimitsDialog } from "./OrgLimitsDialog";
import { RateLimitOverridesDialog } from "./RateLimitOverridesDialog";
import { RateLimitRedisAllowlistDialog } from "./RateLimitRedisAllowlistDialog";
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
	const [openConfig, setOpenConfig] = useState<EdgeConfigCardId | null>(null);
	const [requestBlockRawOpen, setRequestBlockRawOpen] = useState(false);

	const { data: source } = useQuery<EdgeConfigSource>({
		queryKey: ["admin-edge-config-sources"],
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/edge-config-sources");
			return data;
		},
	});

	const closeDialog = (open: boolean) => {
		if (!open) setOpenConfig(null);
	};

	return (
		<div className="flex flex-col gap-8">
			{source && (
				<div className="rounded-lg border border-border bg-muted/20 p-4">
					<div className="grid gap-3 md:grid-cols-[220px_160px]">
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
					</div>
				</div>
			)}

			{EDGE_CONFIG_SECTIONS.map((section) => (
				<section key={section.id} className="flex flex-col gap-3">
					<div className="flex flex-col gap-0.5">
						<h3 className="text-sm font-medium text-foreground">
							{section.title}
						</h3>
						<p className="text-xs text-tertiary-foreground">
							{section.description}
						</p>
					</div>

					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{section.cards.map((card) => (
							<EdgeConfigCard
								key={card.id}
								def={card}
								onEdit={() => setOpenConfig(card.id)}
								secondaryAction={
									card.id === "request-block"
										? {
												label: "Raw",
												onClick: () => setRequestBlockRawOpen(true),
											}
										: undefined
								}
							/>
						))}
					</div>
				</section>
			))}

			<FeatureFlagsDialog
				open={openConfig === "feature-flags"}
				onOpenChange={closeDialog}
			/>

			<EdgeConfigDialog
				open={openConfig === "request-block"}
				onOpenChange={closeDialog}
			/>

			<RawEdgeConfigDialog
				open={requestBlockRawOpen}
				onOpenChange={setRequestBlockRawOpen}
				configId="request-block"
			/>

			<CustomerBlockDialog
				open={openConfig === "customer-block"}
				onOpenChange={closeDialog}
			/>

			<OrgLimitsDialog
				open={openConfig === "org-limits"}
				onOpenChange={closeDialog}
			/>

			<RateLimitOverridesDialog
				open={openConfig === "rate-limit-overrides"}
				onOpenChange={closeDialog}
			/>

			<RateLimitRedisAllowlistDialog
				open={openConfig === "rate-limit-redis-allowlist"}
				onOpenChange={closeDialog}
			/>

			<StripeSyncDialog
				open={openConfig === "stripe-sync"}
				onOpenChange={closeDialog}
			/>

			<RedisV2CacheDialog
				open={openConfig === "redis-v2-cache"}
				onOpenChange={closeDialog}
			/>

			<MainRedisCacheDialog
				open={openConfig === "main-redis-cache"}
				onOpenChange={closeDialog}
			/>

			<CacheV2RampDialog
				open={openConfig === "cache-v2-ramp"}
				onOpenChange={closeDialog}
			/>

			<FullSubjectGateDialog
				open={openConfig === "full-subject-gate"}
				onOpenChange={closeDialog}
			/>

			<MiscellaneousEdgeConfigDialog
				open={openConfig === "miscellaneous"}
				onOpenChange={closeDialog}
			/>
		</div>
	);
}
