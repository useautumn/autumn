import { StatusChip, type StatusGlyph, type StatusTone } from "@autumn/ui";
import type { AdminOrg } from "../AdminOrgColumns";

type StatusBadge = { label: string; tone: StatusTone; glyph: StatusGlyph };

const requestBlockBadge = ({
	blockAll,
	ruleCount,
}: AdminOrg["requestBlockSummary"]): StatusBadge | null => {
	if (blockAll)
		return {
			label: "Blocked",
			tone: "red",
			glyph: "ban",
		};
	if (ruleCount > 0)
		return {
			label: `${ruleCount} rule${ruleCount === 1 ? "" : "s"}`,
			tone: "amber",
			glyph: "alert",
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
			tone: "amber",
			glyph: "minus",
		};
	if (migrationPercent === 100)
		return {
			label: "Redis 100%",
			tone: "green",
			glyph: "check",
		};
	return {
		label: `Redis ${migrationPercent}%`,
		tone: "blue",
		glyph: "refresh",
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
				<StatusChip key={badge.label} tone={badge.tone} glyph={badge.glyph}>
					{badge.label}
				</StatusChip>
			))}
		</div>
	);
};
