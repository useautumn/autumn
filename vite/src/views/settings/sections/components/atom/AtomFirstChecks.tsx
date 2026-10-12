import type { AtomCheck } from "@autumn/shared";
import { StatusChipIcon } from "@autumn/ui";
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

/** The snippets that send the SDK's checks to this Atom, and a quiet wait until the first one lands. */
const AtomCheckWaiting = ({ endpointUrl }: { endpointUrl: string }) => {
	const snippets = checkSnippets({ endpointUrl });
	const [open, setOpen] = useState(snippets[0].value);
	const copyOpenSnippet = () =>
		navigator.clipboard.writeText(
			snippets.find(({ value }) => value === open)?.code ?? "",
		);
	return (
		<>
			<span className="font-medium text-foreground">Send your first check</span>
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
			<div className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2.5">
				<span className="size-2 animate-pulse rounded-full bg-primary" />
				<span className="text-foreground">Waiting for a check…</span>
				<span className="text-tertiary-foreground">
					Run the snippet from your app
				</span>
			</div>
		</>
	);
};

const AtomCheckRow = ({ check }: { check: AtomCheck }) => (
	<div className="flex items-center gap-4 px-3 py-2 font-mono text-xs">
		<span className="text-tertiary-foreground">
			{format(check.at, "HH:mm:ss")}
		</span>
		<span className="min-w-0 flex-1 truncate text-foreground">
			{[check.customer_id, check.feature_id].filter(Boolean).join(" · ")}
		</span>
		<AtomStatusChip chip={ATOM_CHECK_ANSWERED_BY_CHIPS[check.answered_by]} />
	</div>
);

/** The first checks to reach Atom, as they first came in. */
const AtomCheckList = ({ checks }: { checks: AtomCheck[] }) => (
	<>
		<span className="flex items-center gap-2 font-medium text-foreground">
			<StatusChipIcon tone="green" glyph="check" />
			First check received
		</span>
		<div className="flex flex-col divide-y rounded-md border">
			{checks.map((check) => (
				<AtomCheckRow key={`${check.at}-${check.customer_id}`} check={check} />
			))}
		</div>
	</>
);

/** Verify's last part: the org's first checks reaching Atom, or how to send one. */
export const AtomFirstChecks = ({
	endpointUrl,
	checks,
}: {
	endpointUrl: string;
	checks: AtomCheck[];
}) => (
	<div
		className={cn(
			TABLE_TRAY_SURFACE_DIVIDER_CLASS,
			"flex flex-col gap-3 px-4 py-4 text-sm",
		)}
	>
		{checks.length === 0 ? (
			<AtomCheckWaiting endpointUrl={endpointUrl} />
		) : (
			<AtomCheckList checks={checks} />
		)}
	</div>
);
