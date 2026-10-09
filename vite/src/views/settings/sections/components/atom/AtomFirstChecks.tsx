import type { AtomCheck } from "@autumn/shared";
import { StatusChipIcon } from "@autumn/ui";
import { format } from "date-fns";
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

const checkSnippet = ({
	endpointUrl,
}: {
	endpointUrl: string;
}) => `const atom = new Autumn({
  secretKey,
  serverURL: "${endpointUrl}",
});

await atom.check({
  customerId: "<customer_id>",
  featureId: "<feature_id>",
});`;

/** The snippet that points the SDK at Atom, and a quiet wait until its first check lands. */
const AtomCheckWaiting = ({ endpointUrl }: { endpointUrl: string }) => {
	const snippet = checkSnippet({ endpointUrl });
	return (
		<>
			<span className="font-medium text-foreground">Send your first check</span>
			<CodeGroup value="typescript">
				<CodeGroupList>
					<CodeGroupTab value="typescript">TypeScript</CodeGroupTab>
					<CodeGroupCopyButton
						className="h-full"
						onCopy={() => navigator.clipboard.writeText(snippet)}
					/>
				</CodeGroupList>
				<CodeGroupContent value="typescript" copyText={snippet}>
					<CodeGroupCode language="ts">{snippet}</CodeGroupCode>
				</CodeGroupContent>
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
