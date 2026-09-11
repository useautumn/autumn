import { Badge } from "@autumn/ui";
import { cn } from "@/lib/utils";
import type { AdminOrg } from "../AdminOrgColumns";

type StatusBadge = { label: string; className: string };

const requestBlockBadge = ({
	blockAll,
	ruleCount,
}: AdminOrg["requestBlockSummary"]): StatusBadge | null => {
	if (blockAll)
		return {
			label: "Blocked",
			className: "bg-red-50 text-red-700 border-red-200",
		};
	if (ruleCount > 0)
		return {
			label: `${ruleCount} rule${ruleCount === 1 ? "" : "s"}`,
			className: "bg-amber-50 text-amber-700 border-amber-200",
		};
	return null;
};

const redisBadge = (
	redisConfig: AdminOrg["redis_config"],
): StatusBadge | null => {
	if (!redisConfig) return null;
	const { migrationPercent } = redisConfig;
	if (migrationPercent === 0)
		return {
			label: "Redis 0%",
			className: "bg-amber-50 text-amber-700 border-amber-200",
		};
	if (migrationPercent === 100)
		return {
			label: "Redis 100%",
			className: "bg-emerald-50 text-emerald-700 border-emerald-200",
		};
	return {
		label: `Redis ${migrationPercent}%`,
		className: "bg-blue-50 text-blue-700 border-blue-200",
	};
};

/**
 * Collapses request blocks + Redis routing into one column. Defaults (nothing
 * blocked, shared Redis) render as a dash so only exceptions draw the eye.
 */
export const AdminOrgStatusCell = ({ org }: { org: AdminOrg }) => {
	const badges = [
		requestBlockBadge(org.requestBlockSummary),
		redisBadge(org.redis_config),
	].filter((badge): badge is StatusBadge => badge !== null);

	if (!badges.length) return <span className="text-subtle text-xs">—</span>;

	return (
		<div className="flex flex-wrap items-center gap-1">
			{badges.map((badge) => (
				<Badge
					className={cn("shrink-0", badge.className)}
					key={badge.label}
					size="sm"
				>
					{badge.label}
				</Badge>
			))}
		</div>
	);
};
