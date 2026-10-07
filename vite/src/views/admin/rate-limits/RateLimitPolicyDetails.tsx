import { COUNTED_LABELS, OVER_LIMIT_LABELS } from "./formatRateLimit";
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
			<dd>{COUNTED_LABELS[layer.counted]}</dd>
			<dt className="text-tertiary-foreground">Over the limit</dt>
			<dd>{OVER_LIMIT_LABELS[layer.overLimit]}</dd>
			<dt className="text-tertiary-foreground">Key</dt>
			<dd className="truncate font-mono" title={layer.key}>
				{layer.key}
			</dd>
			{layer.skipWithoutCustomerId && (
				<>
					<dt className="text-tertiary-foreground">Skipped</dt>
					<dd>When the request names no customer</dd>
				</>
			)}
		</dl>
	</div>
);

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
			{policy.routes === "*" ? (
				<span className="text-xs">Every route no other row matches</span>
			) : (
				<ul className="flex flex-col gap-0.5 font-mono text-xs">
					{policy.routes.map((route) => (
						<li key={route}>{route}</li>
					))}
				</ul>
			)}
		</div>
	</div>
);
