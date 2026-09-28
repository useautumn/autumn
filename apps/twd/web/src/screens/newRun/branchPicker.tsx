import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, GitPullRequest } from "lucide-react";
import type { Branch } from "../../../../src/api/contract.ts";
import { Pill, StatusDot } from "../../components/status.tsx";
import { cn, sha7 } from "../../lib/format.ts";

const WARM = {
	ready: { tone: "ok", label: "warm" },
	building: { tone: "warn", label: "warming" },
	failed: { tone: "bad", label: "warm failed" },
	none: { tone: "idle", label: "cold" },
} as const;

export const WarmBadge = ({ warm }: { warm: Branch["warm"] }) => (
	<Pill tone={WARM[warm].tone}>
		<StatusDot tone={WARM[warm].tone} pulse={warm === "building"} />
		{WARM[warm].label}
	</Pill>
);

export const BranchPicker = ({
	branches,
	value,
	onChange,
}: {
	branches: Branch[];
	value: Branch | null;
	onChange: (branch: Branch | null) => void;
}) => (
	<Combobox.Root
		items={branches}
		value={value}
		onValueChange={(b) => onChange(b)}
		itemToStringLabel={(b: Branch) => b.name}
		isItemEqualToValue={(a: Branch, b: Branch) => a.name === b.name}
		autoHighlight
		openOnInputClick
	>
		<div className="relative">
			<Combobox.Input
				placeholder="Search branches…"
				aria-label="Branch"
				className="h-input w-full rounded-lg input-base input-shadow-default input-state-focus pr-40 font-mono text-[13px] text-foreground outline-none placeholder:font-sans"
			/>
			<div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-2">
				{value && (
					<>
						{value.prNumber && (
							<span className="flex items-center gap-1 text-xs text-tertiary-foreground">
								<GitPullRequest className="size-3" />#{value.prNumber}
							</span>
						)}
						<span className="text-tiny-id text-subtle">{sha7(value.sha)}</span>
					</>
				)}
				<Combobox.Trigger
					aria-label="Show branches"
					className="pointer-events-auto flex size-6 cursor-pointer items-center justify-center rounded text-subtle hover:text-foreground"
				>
					<ChevronsUpDown className="size-3.5" />
				</Combobox.Trigger>
			</div>
		</div>
		<Combobox.Portal>
			<Combobox.Positioner
				sideOffset={4}
				className="isolate z-[300] w-[var(--anchor-width)]"
			>
				<Combobox.Popup className="max-h-80 overflow-auto rounded-lg bg-interactive-secondary p-1 text-muted-foreground shadow-md ring-1 ring-foreground/10 outline-none">
					<Combobox.Empty className="px-2 py-3 text-center text-xs text-tertiary-foreground empty:hidden">
						No branch matches. Push it first — twd only sees branches on origin.
					</Combobox.Empty>
					<Combobox.List>
						{(b: Branch) => (
							<Combobox.Item
								key={b.name}
								value={b}
								className={cn(
									"grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto_auto_4rem] items-center gap-3 rounded-md px-1.5 py-1 text-sm outline-none data-[highlighted]:bg-interactive-secondary-hover data-[highlighted]:text-foreground",
								)}
							>
								<span className="flex size-4 items-center">
									<Combobox.ItemIndicator>
										<Check className="size-3.5" />
									</Combobox.ItemIndicator>
								</span>
								<span className="truncate text-tiny-id text-foreground">
									{b.name}
								</span>
								<span className="text-xs text-tertiary-foreground tabular-nums">
									{b.prNumber ? `#${b.prNumber}` : ""}
								</span>
								<WarmBadge warm={b.warm} />
								<span className="text-right text-tiny-id text-subtle">
									{sha7(b.sha)}
								</span>
							</Combobox.Item>
						)}
					</Combobox.List>
				</Combobox.Popup>
			</Combobox.Positioner>
		</Combobox.Portal>
	</Combobox.Root>
);
