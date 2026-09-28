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
				className="h-9 w-full rounded-md border border-line bg-surface pr-40 pl-3 font-mono text-[13px] outline-none transition-colors placeholder:font-sans placeholder:text-faint focus:border-line-strong focus-visible:ring-2 focus-visible:ring-info/30"
			/>
			<div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-2">
				{value && (
					<>
						{value.prNumber && (
							<span className="flex items-center gap-1 text-xs text-muted">
								<GitPullRequest className="size-3" />#{value.prNumber}
							</span>
						)}
						<span className="font-mono text-[11px] text-faint">
							{sha7(value.sha)}
						</span>
					</>
				)}
				<Combobox.Trigger
					aria-label="Show branches"
					className="pointer-events-auto flex size-6 cursor-pointer items-center justify-center rounded text-faint hover:text-fg"
				>
					<ChevronsUpDown className="size-3.5" />
				</Combobox.Trigger>
			</div>
		</div>
		<Combobox.Portal>
			<Combobox.Positioner
				sideOffset={4}
				className="z-50 w-[var(--anchor-width)]"
			>
				<Combobox.Popup className="max-h-80 overflow-auto rounded-lg border border-line bg-surface p-1 shadow-lg outline-none">
					<Combobox.Empty className="px-2 py-3 text-center text-xs text-muted empty:hidden">
						No branch matches. Push it first — twd only sees branches on origin.
					</Combobox.Empty>
					<Combobox.List>
						{(b: Branch) => (
							<Combobox.Item
								key={b.name}
								value={b}
								className={cn(
									"grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto_auto_4rem] items-center gap-3 rounded-md px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-hover",
								)}
							>
								<span className="flex size-4 items-center">
									<Combobox.ItemIndicator>
										<Check className="size-3.5" />
									</Combobox.ItemIndicator>
								</span>
								<span className="truncate font-mono">{b.name}</span>
								<span className="text-xs text-muted tabular-nums">
									{b.prNumber ? `#${b.prNumber}` : ""}
								</span>
								<WarmBadge warm={b.warm} />
								<span className="text-right font-mono text-[11px] text-faint">
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
