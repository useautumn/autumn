import { StatusChip } from "@autumn/ui";
import { formatLimit } from "./formatRateLimit";
import type {
	RateLimitPolicyOverride,
	RateLimitPolicySummary,
} from "./rateLimitTypes";

/** "org 20k/s · 240k/min": the per-customer value first, then per org. */
export const RateLimitOverrideBadge = ({
	policy,
	override,
	orgName,
}: {
	policy: RateLimitPolicySummary;
	override: RateLimitPolicyOverride;
	orgName: string;
}) => {
	const values = [
		policy.perCustomer && override.perCustomer !== undefined
			? formatLimit({
					limit: override.perCustomer,
					windowMs: policy.perCustomer.windowMs,
				})
			: null,
		policy.perOrg && override.perOrg !== undefined
			? formatLimit({
					limit: override.perOrg,
					windowMs: policy.perOrg.windowMs,
				})
			: null,
	].filter((value) => value !== null);

	return (
		<StatusChip tone="purple" glyph="pencil">
			<span className="truncate">{orgName}</span>
			<span className="tabular-nums">{values.join(" · ")}</span>
		</StatusChip>
	);
};
