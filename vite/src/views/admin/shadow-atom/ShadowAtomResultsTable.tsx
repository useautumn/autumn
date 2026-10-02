import { cn } from "@autumn/ui/lib/utils";
import {
	LIST_EMPTY,
	LIST_FRAME,
	ROW_HEADER_LAYOUT,
	ROW_LAYOUT,
} from "../edge-config/rolloutRowStyles";
import type { ShadowAtomResults } from "./shadowAtomTypes";

const COLUMNS =
	"md:grid-cols-[minmax(0,1fr)_90px_90px_90px_90px_90px] grid-cols-[minmax(0,1fr)_repeat(5,auto)]";

const formatRate = (rate: number | null) =>
	rate === null ? "—" : `${(rate * 100).toFixed(2)}%`;

const formatMs = (ms: number) => `${Math.round(ms)} ms`;

const HEADERS = ["Org", "Checks", "Match", "p50", "p99", "Timeouts / errors"];

/** Per org over the window: how often the shadow Atom agreed with the API, and how fast it answered. */
export const ShadowAtomResultsTable = ({
	results,
}: {
	results: ShadowAtomResults;
}) => {
	if (!results.available)
		return (
			<p className={cn(LIST_FRAME, LIST_EMPTY)}>
				Axiom is not configured on this server, so there are no results.
			</p>
		);

	return (
		<div className={LIST_FRAME}>
			<div className={cn(ROW_HEADER_LAYOUT, COLUMNS)}>
				{HEADERS.map((header) => (
					<span key={header}>{header}</span>
				))}
			</div>
			{results.orgs.length === 0 && (
				<p className={LIST_EMPTY}>
					No shadow checks in the last {results.range}.
				</p>
			)}
			{results.orgs.map((org) => (
				<div
					key={org.org_id}
					className={cn(ROW_LAYOUT, COLUMNS, "text-xs tabular-nums")}
				>
					<span className="truncate font-mono text-foreground">
						{org.org_id}
					</span>
					<span>{org.checks.toLocaleString()}</span>
					<span>{formatRate(org.match_rate)}</span>
					<span>{formatMs(org.p50_ms)}</span>
					<span>{formatMs(org.p99_ms)}</span>
					<span>
						{org.timeouts} / {org.errors}
					</span>
				</div>
			))}
		</div>
	);
};
