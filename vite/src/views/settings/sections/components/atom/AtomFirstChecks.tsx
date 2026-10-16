import type { AtomCheck } from "@autumn/shared";
import { Skeleton, StatusChipIcon } from "@autumn/ui";
import { format } from "date-fns";
import { useState } from "react";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupContent,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import { cn } from "@/lib/utils";
import { AtomStatusChip } from "./AtomStatusChip";
import { ATOM_CHECK_ANSWERED_BY_CHIPS } from "./atomDisplay";

/** The SDK setup that sends checks to this Atom, per language; the copy button copies the open tab. */
const checkSnippets = ({ endpointUrl }: { endpointUrl: string }) => [
	{
		value: "typescript",
		label: "TypeScript",
		language: "ts",
		code: `const autumn = new Autumn({
  secretKey,
  edgeURL: "${endpointUrl}",
  useEdge: true,
});

// Answered by your Atom; asks Autumn instead whenever it is down
await autumn.check({
  customerId: "<customer_id>",
  featureId: "<feature_id>",
});

// Without useEdge, ask the Atom for one call only
await autumn.edge.check({
  customerId: "<customer_id>",
  featureId: "<feature_id>",
});`,
	},
	{
		value: "python",
		label: "Python",
		language: "python",
		code: `autumn = Autumn(
    secret_key=secret_key,
    edge_url="${endpointUrl}",
    use_edge=True,
)

# Answered by your Atom; asks Autumn instead whenever it is down
autumn.check(customer_id="<customer_id>", feature_id="<feature_id>")

# Without use_edge, ask the Atom for one call only
autumn.edge.check(customer_id="<customer_id>", feature_id="<feature_id>")`,
	},
];

/** Checks shown as they first came in; the list keeps room for this many so it never grows as they land. */
const SHOWN_CHECKS = 3;
const CHECKS_HEIGHT_CLASS = "h-[110px]";

/** The SDK setup that points at this Atom, per language; the copy button copies the open tab. */
const AtomCheckSnippets = ({ endpointUrl }: { endpointUrl: string }) => {
	const snippets = checkSnippets({ endpointUrl });
	const [open, setOpen] = useState(snippets[0].value);
	const copyOpenSnippet = () =>
		navigator.clipboard.writeText(
			snippets.find(({ value }) => value === open)?.code ?? "",
		);
	return (
		<CodeGroup value={open} onValueChange={(value) => setOpen(String(value))}>
			<CodeGroupList>
				{snippets.map(({ value, label }) => (
					<CodeGroupTab key={value} value={value}>
						{label}
					</CodeGroupTab>
				))}
				<CodeGroupCopyButton className="h-full" onCopy={copyOpenSnippet} />
			</CodeGroupList>
			{snippets.map(({ value, language, code }) => (
				<CodeGroupContent key={value} value={value} copyText={code}>
					<CodeGroupCode language={language}>{code}</CodeGroupCode>
				</CodeGroupContent>
			))}
		</CodeGroup>
	);
};

const AtomCheckRow = ({ check }: { check: AtomCheck }) => (
	<div className="flex h-9 shrink-0 items-center gap-4 px-3 font-mono text-xs">
		<span className="text-tertiary-foreground">
			{format(check.at, "HH:mm:ss")}
		</span>
		<span className="min-w-0 flex-1 truncate text-foreground">
			{[check.customer_id, check.feature_id].filter(Boolean).join(" · ")}
		</span>
		<AtomStatusChip chip={ATOM_CHECK_ANSWERED_BY_CHIPS[check.answered_by]} />
	</div>
);

/** Where the first checks land: a quiet wait until the Atom counts one, in the same box the checks then fill. */
const AtomCheckList = ({
	isConnected,
	firstCheckSeenAt,
	checks,
}: {
	isConnected: boolean;
	firstCheckSeenAt: number | null;
	checks: AtomCheck[];
}) => {
	if (firstCheckSeenAt === null)
		return (
			<div
				className={cn(
					CHECKS_HEIGHT_CLASS,
					"flex items-center justify-center gap-3 rounded-md border border-dashed px-3",
				)}
			>
				<span className="size-2 animate-pulse rounded-full bg-primary" />
				<span className="text-foreground">
					{isConnected
						? "Waiting for a check…"
						: "Waiting for Atom to connect…"}
				</span>
				<span className="text-tertiary-foreground">
					{isConnected
						? "Run the snippet from your app"
						: "Checks show here once it does"}
				</span>
			</div>
		);
	// Only sampled checks are logged, so the Atom can count one that none here show.
	if (checks.length === 0)
		return (
			<div
				className={cn(
					CHECKS_HEIGHT_CLASS,
					"flex items-center justify-center gap-3 rounded-md border px-3",
				)}
			>
				<StatusChipIcon tone="green" glyph="check" />
				<span className="text-foreground">Checks are reaching your Atom</span>
				<span className="text-tertiary-foreground">
					First at {format(firstCheckSeenAt, "HH:mm:ss")}
				</span>
			</div>
		);
	return (
		<div
			className={cn(
				CHECKS_HEIGHT_CLASS,
				"flex flex-col divide-y overflow-hidden rounded-md border",
			)}
		>
			{checks.slice(0, SHOWN_CHECKS).map((check) => (
				<AtomCheckRow key={`${check.at}-${check.customer_id}`} check={check} />
			))}
		</div>
	);
};

/** Verify's last part: how to send checks to this Atom, and the first ones as they reach it. */
export const AtomFirstChecks = ({
	endpointUrl,
	isConnected,
	firstCheckSeenAt,
	checks,
}: {
	endpointUrl: string | null;
	isConnected: boolean;
	firstCheckSeenAt: number | null;
	checks: AtomCheck[];
}) => (
	<div
		className={cn(
			TABLE_TRAY_SURFACE_DIVIDER_CLASS,
			"flex flex-col gap-3 px-4 py-4 text-sm",
		)}
	>
		<span className="flex h-5 items-center gap-2 font-medium text-foreground">
			{firstCheckSeenAt !== null ? (
				<>
					<StatusChipIcon tone="green" glyph="check" />
					First check received
				</>
			) : (
				"Send your first check"
			)}
		</span>
		{endpointUrl ? (
			<AtomCheckSnippets endpointUrl={endpointUrl} />
		) : (
			<Skeleton className="h-[330px] w-full" />
		)}
		<AtomCheckList
			isConnected={isConnected}
			firstCheckSeenAt={firstCheckSeenAt}
			checks={checks}
		/>
	</div>
);
