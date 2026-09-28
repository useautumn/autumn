import {
	Check,
	Loader2,
	RefreshCw,
	Search,
	ShieldAlert,
	X,
} from "lucide-react";
import { useState } from "react";
import type { StripeKey } from "../../../src/api/contract.ts";
import { useKeys, useProbeKeys, useReinitKeys } from "../api/hooks.ts";
import { PageHeader } from "../components/appShell.tsx";
import { ErrorCallout } from "../components/status.tsx";
import {
	Button,
	Card,
	ConfirmDialog,
	Empty,
	Input,
	Segmented,
	Skeleton,
	Tooltip,
} from "../components/ui.tsx";
import { cn, num, timeAgo } from "../lib/format.ts";

const FILTERS = ["all", "unusable", "no webhook", "missing"] as const;
type Filter = (typeof FILTERS)[number];
const PAGE = 100;
const GRID =
	"grid grid-cols-[6.5rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.6fr)_4.5rem_repeat(4,3.5rem)_5.5rem] items-center gap-3";

const matches = (k: StripeKey, filter: Filter) =>
	filter === "all" ||
	(filter === "unusable" && !k.usable) ||
	(filter === "no webhook" && k.usable && !k.webhookRegistered) ||
	(filter === "missing" && !k.present);

const Summary = ({
	label,
	value,
	sub,
	tone,
}: {
	label: string;
	value: string;
	sub?: string;
	tone?: "bad" | "warn";
}) => (
	<Card className="px-4 py-3">
		<p className="text-[11px] text-muted">{label}</p>
		<p
			className={cn(
				"mt-1 text-lg font-semibold tabular-nums",
				tone === "bad" && "text-bad",
				tone === "warn" && "text-warn",
			)}
		>
			{value}
		</p>
		{sub && <p className="text-[11px] text-faint">{sub}</p>}
	</Card>
);

export const KeysScreen = () => {
	const keys = useKeys();
	const probe = useProbeKeys();
	const reinit = useReinitKeys();
	const [confirm, setConfirm] = useState(false);
	const [filter, setFilter] = useState<Filter>("all");
	const [query, setQuery] = useState("");
	const [limit, setLimit] = useState(PAGE);

	const data = keys.data;
	const all = data?.keys ?? [];
	const usable = all.filter((k) => k.usable).length;
	const webhooks = all.filter((k) => k.webhookRegistered).length;
	const totals = all.reduce(
		(acc, k) => ({
			clean: acc.clean + k.accounts.clean,
			busy:
				acc.busy + k.accounts.reserved + k.accounts.inUse + k.accounts.nuking,
			broken: acc.broken + k.accounts.broken,
		}),
		{ clean: 0, busy: 0, broken: 0 },
	);
	const q = query.trim().toLowerCase();
	const rows = all
		.filter((k) => matches(k, filter))
		.filter(
			(k) =>
				!q ||
				[k.platformAccountId, k.keyHint, k.displayName ?? ""].some((v) =>
					v.toLowerCase().includes(q),
				),
		)
		.sort((a, b) => Number(a.usable) - Number(b.usable));
	const draining = data?.gate.state === "draining";
	const lastProbe =
		all
			.map((k) => k.probedAt)
			.filter((v): v is string => !!v)
			.sort()
			.at(-1) ?? null;

	return (
		<>
			<PageHeader
				title="Stripe keys"
				description="Platform keys from TW_V3_KEYS. Each usable key hosts a pool of connected test accounts."
				actions={
					<>
						<Button
							disabled={probe.isPending || draining}
							onClick={() => probe.mutate()}
						>
							{probe.isPending ? (
								<Loader2 className="animate-spin" />
							) : (
								<RefreshCw />
							)}{" "}
							Probe keys
						</Button>
						<Button disabled={draining} onClick={() => setConfirm(true)}>
							Re-initialise
						</Button>
					</>
				}
			/>

			{draining && (
				<div className="mb-5 flex items-start gap-3 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-[13px]">
					<Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-warn" />
					<div className="min-w-0">
						<p className="font-medium">
							Gate is draining — new runs are paused
						</p>
						<p className="mt-0.5 text-pretty text-muted">
							{data?.gate.reason ?? "Keys are being re-initialised."}
							{data?.gate.jobId && (
								<span className="ml-1 font-mono text-[11px] text-faint">
									{data.gate.jobId}
								</span>
							)}
						</p>
					</div>
				</div>
			)}
			<ErrorCallout
				error={keys.error ?? probe.error ?? reinit.error}
				className="mb-5"
			/>

			<div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
				<Summary
					label="Usable keys"
					value={data ? `${num(usable)} / ${num(all.length)}` : "—"}
					sub={`${all.length - usable} unusable`}
					tone={data && usable < all.length ? "warn" : undefined}
				/>
				<Summary
					label="Webhooks registered"
					value={data ? num(webhooks) : "—"}
					sub={
						data
							? `${usable - webhooks > 0 ? `${usable - webhooks} usable keys missing one` : "every usable key"}`
							: undefined
					}
					tone={usable - webhooks > 0 ? "warn" : undefined}
				/>
				<Summary
					label="Accounts clean"
					value={num(totals.clean)}
					sub={`${num(totals.busy)} busy · ${num(totals.broken)} broken`}
				/>
				<Summary
					label="Last probe"
					value={timeAgo(lastProbe)}
					sub="Probe checks key validity + Connect"
				/>
			</div>

			<div className="mb-2 flex items-center justify-between gap-3">
				<Segmented
					label="Key filter"
					value={filter}
					onChange={(f) => {
						setFilter(f);
						setLimit(PAGE);
					}}
					options={FILTERS.map((f) => ({
						value: f,
						label: (
							<>
								<span className="capitalize">{f}</span>
								<span className="text-faint tabular-nums">
									{all.filter((k) => matches(k, f)).length}
								</span>
							</>
						),
					}))}
				/>
				<div className="relative w-64">
					<Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="acct_…, sk_test_…, name"
						aria-label="Search keys"
						className="h-7 pl-8 text-xs"
					/>
				</div>
			</div>

			<Card className="overflow-x-auto">
				<div className="min-w-[980px]">
					<div
						className={cn(
							GRID,
							"h-8 bg-raised/50 px-4 text-[11px] font-medium text-muted",
						)}
					>
						<span>Key</span>
						<span>Platform account</span>
						<span>Name</span>
						<span>Usable</span>
						<span>Webhook</span>
						<span className="text-right">Clean</span>
						<span className="text-right">Held</span>
						<span className="text-right">Nuking</span>
						<span className="text-right">Broken</span>
						<span className="text-right">Probed</span>
					</div>
					{keys.isLoading ? (
						<div className="space-y-2 p-4">
							{[0, 1, 2, 3, 4, 5].map((i) => (
								<Skeleton key={i} className="h-6 w-full" />
							))}
						</div>
					) : rows.length === 0 ? (
						<Empty
							title="No keys match"
							body="Clear the search or pick another filter."
						/>
					) : (
						rows.slice(0, limit).map((k) => (
							<div
								key={k.platformAccountId}
								className={cn(
									GRID,
									"h-8 border-t border-line px-4 text-xs ",
									!k.present && "opacity-60",
								)}
							>
								<span className="truncate font-mono text-[11px] text-muted">
									{k.keyHint}
								</span>
								<span className="truncate font-mono text-[11px]">
									{k.platformAccountId}
								</span>
								<span className="truncate">
									{k.displayName ?? <span className="text-faint">—</span>}
								</span>
								<span className="flex min-w-0 items-center gap-1.5">
									{k.usable ? (
										<Check
											className="size-3.5 shrink-0 text-ok"
											aria-label="Usable"
										/>
									) : (
										<>
											<X
												className="size-3.5 shrink-0 text-bad"
												aria-label="Unusable"
											/>
											<Tooltip content={k.unusableReason}>
												<span className="truncate text-bad">
													{k.unusableReason}
												</span>
											</Tooltip>
										</>
									)}
									{!k.present && (
										<span className="shrink-0 text-[11px] text-warn">
											not in env
										</span>
									)}
								</span>
								<span>
									{k.webhookRegistered ? (
										<Check
											className="size-3.5 text-ok"
											aria-label="Registered"
										/>
									) : (
										<X
											className="size-3.5 text-faint"
											aria-label="Not registered"
										/>
									)}
								</span>
								<span className="text-right tabular-nums">
									{k.accounts.clean || <span className="text-faint">0</span>}
								</span>
								<span className="text-right tabular-nums">
									{k.accounts.reserved + k.accounts.inUse || (
										<span className="text-faint">0</span>
									)}
								</span>
								<span className="text-right tabular-nums">
									{k.accounts.nuking || <span className="text-faint">0</span>}
								</span>
								<span
									className={cn(
										"text-right tabular-nums",
										k.accounts.broken ? "text-bad" : "text-faint",
									)}
								>
									{k.accounts.broken}
								</span>
								<span className="text-right text-faint tabular-nums">
									{timeAgo(k.probedAt)}
								</span>
							</div>
						))
					)}
					{rows.length > limit && (
						<button
							type="button"
							onClick={() => setLimit((l) => l + PAGE)}
							className="block w-full cursor-pointer border-t border-line px-4 py-2 text-center text-xs text-muted hover:bg-hover hover:text-fg"
						>
							Show more ({num(rows.length - limit)} left)
						</button>
					)}
				</div>
			</Card>

			<ConfirmDialog
				open={confirm}
				onOpenChange={setConfirm}
				title="Re-initialise every Stripe key?"
				confirmLabel="Drain and re-initialise"
				pending={reinit.isPending}
				onConfirm={() =>
					reinit.mutate(undefined, { onSettled: () => setConfirm(false) })
				}
			>
				<ol className="list-decimal space-y-1.5 pl-4">
					<li>
						<span className="text-fg">Drain.</span> The gate closes, so new runs
						are refused. twd waits for live swarms and nukes to finish.
					</li>
					<li>
						<span className="text-fg">Delete webhooks.</span> Every webhook
						endpoint on each <span className="font-mono">TW_V3_KEYS</span> key
						is removed.
					</li>
					<li>
						<span className="text-fg">Re-register.</span> One Connect webhook
						per usable key, pointed at{" "}
						<span className="font-mono">/ingress/connect/sandbox</span>, then
						keys are re-probed and the gate reopens.
					</li>
				</ol>
				<p className="mt-3 flex items-start gap-2 text-xs">
					<ShieldAlert className="mt-px size-3.5 shrink-0 text-warn" />
					Idempotent and safe to rerun, but it blocks everyone's runs until it
					finishes.
				</p>
			</ConfirmDialog>
		</>
	);
};
