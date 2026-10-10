import {
	formatVersion,
	OVER_LIMIT_LABELS,
	STORE_LABELS,
} from "./formatRateLimit";
import type {
	RateLimitLayerSummary,
	RateLimitPolicySummary,
} from "./rateLimitTypes";

const LayerDetails = ({
	title,
	layer,
}: {
	title: string;
	layer: RateLimitLayerSummary;
}) => (
	<div className="flex min-w-0 flex-col gap-1.5">
		<span className="text-[11px] uppercase tracking-wide text-subtle">
			{title}
		</span>
		<dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
			<dt className="text-tertiary-foreground">Counted</dt>
			<dd>{STORE_LABELS[layer.store]}</dd>
			<dt className="text-tertiary-foreground">Over the limit</dt>
			<dd>{OVER_LIMIT_LABELS[layer.overLimit]}</dd>
			<dt className="text-tertiary-foreground">Key</dt>
			<dd className="flex min-w-0 flex-col font-mono">
				{layer.versionLimits.map(({ upTo, key }) => (
					<span key={upTo} className="break-all md:truncate" title={key}>
						{key}
						<span className="ml-1.5 font-sans text-tertiary-foreground">
							≤ {formatVersion(upTo)}
						</span>
					</span>
				))}
				<span className="break-all md:truncate" title={layer.key}>
					{layer.key}
					{layer.versionLimits.length > 0 && (
						<span className="ml-1.5 font-sans text-tertiary-foreground">
							other versions
						</span>
					)}
				</span>
			</dd>
		</dl>
	</div>
);

const PolicyRoutes = ({
	routes,
}: {
	routes: RateLimitPolicySummary["routes"];
}) => {
	if (routes === "*") {
		return <span className="text-xs">Every route no other row matches</span>;
	}
	if (routes.length === 0) {
		return <span className="text-xs">Chosen in code, not by route</span>;
	}
	return (
		<ul className="flex flex-col gap-0.5 font-mono text-xs">
			{routes.map((route) => (
				<li key={route} className="break-all">
					{route}
				</li>
			))}
		</ul>
	);
};

/** How each layer counts and rejects, and which routes the row covers. */
export const RateLimitPolicyDetails = ({
	policy,
}: {
	policy: RateLimitPolicySummary;
}) => (
	<div className="grid gap-4 bg-muted/20 px-4 py-3 md:grid-cols-3 md:pl-11">
		{policy.perCustomer && (
			<LayerDetails title="Per customer" layer={policy.perCustomer} />
		)}
		{policy.perOrg && <LayerDetails title="Per org" layer={policy.perOrg} />}
		<div className="flex min-w-0 flex-col gap-1.5">
			<span className="text-[11px] uppercase tracking-wide text-subtle">
				Routes
			</span>
			<PolicyRoutes routes={policy.routes} />
		</div>
	</div>
);
