import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui/components/ui/dropdown-menu";
import { KeyIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import {
	Bomb,
	Check,
	Loader2,
	MoreHorizontal,
	RefreshCw,
	ShieldAlert,
	X,
} from "lucide-react";
import { useState } from "react";
import type { Job, StripeKey } from "../../../src/api/contract.ts";
import { useJobs, useKeys, useProbeKeys, useReinitKeys } from "../api/hooks.ts";
import { useLiveTopics } from "../api/live.ts";
import { ErrorCallout, Pill } from "../components/status.tsx";
import {
	Button,
	ConfirmDialog,
	DataTable,
	PageHeader,
	SearchInput,
	Segmented,
	TableMore,
	Tooltip,
} from "../components/ui.tsx";
import { cn, elapsed, num, timeAgo } from "../lib/format.ts";
import { useNow } from "../lib/useNow.ts";
import { FullNukeDialog } from "./keys/fullNukeDialog.tsx";

const FILTERS = ["all", "unusable", "no webhook", "missing"] as const;
type Filter = (typeof FILTERS)[number];
const PAGE = 100;

const isFullNuking = (k: StripeKey) =>
	!k.usable &&
	!!k.unusableReason?.toLowerCase().startsWith("full nuke in progress");
const isLiveJob = (j: Job | undefined) =>
	j?.status === "queued" || j?.status === "running";
const RECENT_MS = 15 * 60_000;

const FullNukeStatus = ({ job, now }: { job: Job; now: number }) => {
	if (isLiveJob(job))
		return (
			<Pill tone="info" className="tabular-nums">
				{job.status === "queued"
					? "queued"
					: elapsed({ from: job.startedAt, to: null, now })}
			</Pill>
		);
	if (job.status === "succeeded")
		return <Pill tone="ok">nuked {timeAgo(job.finishedAt, now)}</Pill>;
	return (
		<Tooltip content={job.error ?? job.status}>
			<Pill tone="bad">full nuke {job.status}</Pill>
		</Tooltip>
	);
};

const matches = (k: StripeKey, filter: Filter) =>
	filter === "all" ||
	(filter === "unusable" && !k.usable) ||
	(filter === "no webhook" && k.usable && !k.webhookRegistered) ||
	(filter === "missing" && !k.present);

export const KeysScreen = () => {
	const keys = useKeys();
	const probe = useProbeKeys();
	const reinit = useReinitKeys();
	const [confirm, setConfirm] = useState(false);
	const [filter, setFilter] = useState<Filter>("all");
	const [query, setQuery] = useState("");
	const [limit, setLimit] = useState(PAGE);
	const [nuking, setNuking] = useState<StripeKey | null>(null);
	const jobs = useJobs();
	useLiveTopics("keys", "jobs");

	const fullNukeJobs = new Map<string, Job>();
	for (const j of jobs.data ?? []) {
		if (j.kind !== "full_nuke_key") continue;
		const pid = j.singletonKey.split(":").at(-1) ?? "";
		const prev = fullNukeJobs.get(pid);
		if (!prev || Date.parse(j.createdAt) > Date.parse(prev.createdAt))
			fullNukeJobs.set(pid, j);
	}
	const anyLive = [...fullNukeJobs.values()].some(isLiveJob);
	const now = useNow({ active: anyLive });
	const jobFor = (k: StripeKey) => {
		const j = fullNukeJobs.get(k.platformAccountId);
		if (!j) return undefined;
		if (isLiveJob(j)) return j;
		return now - Date.parse(j.finishedAt ?? j.createdAt) < RECENT_MS
			? j
			: undefined;
	};

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

	const columns: ColumnDef<StripeKey>[] = [
		{
			id: "key",
			header: "Key",
			size: 110,
			cell: ({ row: { original: k } }) => (
				<span className="text-tiny-id text-tertiary-foreground">
					{k.keyHint}
				</span>
			),
		},
		{
			id: "account",
			header: "Platform account",
			size: 200,
			cell: ({ row: { original: k } }) => (
				<span className="block truncate text-tiny-id text-foreground">
					{k.platformAccountId}
				</span>
			),
		},
		{
			id: "name",
			header: "Name",
			size: 160,
			cell: ({ row: { original: k } }) =>
				k.displayName ?? <span className="text-subtle">—</span>,
		},
		{
			id: "usable",
			header: "Usable",
			size: 220,
			meta: { grow: true },
			cell: ({ row: { original: k } }) => {
				const job = jobFor(k);
				return (
					<span className="flex min-w-0 items-center gap-1.5 text-xs">
						{isFullNuking(k) || isLiveJob(job) ? (
							<>
								<Loader2 className="size-3.5 shrink-0 animate-spin text-blue-600 dark:text-blue-400" />
								<span className="shrink-0 text-blue-600 dark:text-blue-400">
									Nuking…
								</span>
							</>
						) : k.usable ? (
							<Check
								className="size-3.5 shrink-0 text-green-600 dark:text-green-500"
								aria-label="Usable"
							/>
						) : (
							<>
								<X
									className="size-3.5 shrink-0 text-red-600 dark:text-red-400"
									aria-label="Unusable"
								/>
								<Tooltip content={k.unusableReason}>
									<span className="truncate text-red-600 dark:text-red-400">
										{k.unusableReason}
									</span>
								</Tooltip>
							</>
						)}
						{job && <FullNukeStatus job={job} now={now} />}
						{!k.present && <Pill tone="warn">not in env</Pill>}
					</span>
				);
			},
		},
		{
			id: "webhook",
			header: "Webhook",
			size: 80,
			cell: ({ row: { original: k } }) =>
				k.webhookRegistered ? (
					<Check
						className="size-3.5 text-green-600 dark:text-green-500"
						aria-label="Registered"
					/>
				) : (
					<X className="size-3.5 text-subtle" aria-label="Not registered" />
				),
		},
		...(
			[
				["clean", "Clean", (k: StripeKey) => k.accounts.clean],
				[
					"held",
					"Held",
					(k: StripeKey) => k.accounts.reserved + k.accounts.inUse,
				],
				["nuking", "Nuking", (k: StripeKey) => k.accounts.nuking],
				["broken", "Broken", (k: StripeKey) => k.accounts.broken],
			] as const
		).map(
			([id, header, value]): ColumnDef<StripeKey> => ({
				id,
				header,
				size: 70,
				cell: ({ row: { original: k } }) => (
					<span
						className={cn(
							"text-xs tabular-nums",
							!value(k)
								? "text-subtle"
								: id === "broken"
									? "text-red-600 dark:text-red-400"
									: "text-foreground",
						)}
					>
						{value(k)}
					</span>
				),
			}),
		),
		{
			id: "probed",
			header: "Probed",
			size: 90,
			cell: ({ row: { original: k } }) => (
				<span className="text-xs text-subtle tabular-nums">
					{timeAgo(k.probedAt)}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			size: 44,
			cell: ({ row: { original: k } }) => (
				<span className="flex justify-end">
					<DropdownMenu>
						<DropdownMenuTrigger
							aria-label={`Actions for ${k.keyHint}`}
							className="flex size-6 cursor-pointer items-center justify-center rounded-md text-subtle hover:bg-muted hover:text-foreground"
						>
							<MoreHorizontal className="size-3.5" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-44">
							<DropdownMenuItem
								disabled={isFullNuking(k) || isLiveJob(jobFor(k)) || !k.present}
								onClick={() => setNuking(k)}
								className="text-red-600 dark:text-red-400"
							>
								<Bomb className="size-3.5" />
								Full Nuke…
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</span>
			),
		},
	];

	return (
		<>
			<PageHeader
				icon={<KeyIcon size={16} weight="fill" />}
				title="Stripe keys"
			>
				<Button
					variant="secondary"
					disabled={draining}
					isLoading={probe.isPending}
					onClick={() => probe.mutate()}
				>
					<RefreshCw className="size-3.5" /> Probe keys
				</Button>
				<Button
					variant="secondary"
					disabled={draining}
					onClick={() => setConfirm(true)}
				>
					Re-initialise
				</Button>
			</PageHeader>

			{draining && (
				<div className="mb-4 flex items-start gap-2.5 rounded-lg border border-orange-400/30 bg-orange-400/5 px-3 py-2 text-sm">
					<Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-orange-600 dark:text-orange-400" />
					<div className="min-w-0">
						<p className="font-medium text-foreground">
							Gate is draining — new runs are paused
						</p>
						<p className="text-xs text-pretty text-tertiary-foreground">
							{data?.gate.reason ?? "Keys are being re-initialised."}
							{data?.gate.jobId && (
								<span className="ml-1 text-tiny-id text-subtle">
									{data.gate.jobId}
								</span>
							)}
						</p>
					</div>
				</div>
			)}
			<ErrorCallout
				error={keys.error ?? jobs.error ?? probe.error ?? reinit.error}
				className="mb-4"
			/>

			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-3 text-xs text-tertiary-foreground tabular-nums">
				<span>
					<span
						className={cn(
							"font-medium",
							data && usable < all.length
								? "text-orange-600 dark:text-orange-400"
								: "text-foreground",
						)}
					>
						{data ? `${num(usable)} / ${num(all.length)}` : "—"}
					</span>{" "}
					usable
				</span>
				<span>
					<span
						className={cn(
							"font-medium",
							usable - webhooks > 0
								? "text-orange-600 dark:text-orange-400"
								: "text-foreground",
						)}
					>
						{num(webhooks)}
					</span>{" "}
					webhooks
					{usable - webhooks > 0 && ` (${usable - webhooks} missing)`}
				</span>
				<span>
					<span className="font-medium text-foreground">
						{num(totals.clean)}
					</span>{" "}
					clean · {num(totals.busy)} busy · {num(totals.broken)} broken
				</span>
				<span>last probe {timeAgo(lastProbe)}</span>
			</div>

			<div className="flex flex-wrap items-center gap-2 pb-4">
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
								<span className="capitalize">{f}</span>{" "}
								<span className="text-subtle tabular-nums">
									{all.filter((k) => matches(k, f)).length}
								</span>
							</>
						),
					}))}
				/>
				<SearchInput
					value={query}
					onChange={setQuery}
					placeholder="acct_…, sk_test_…, name"
					className="flex-1"
				/>
			</div>

			<DataTable
				data={keys.data ? rows.slice(0, limit) : undefined}
				isLoading={keys.isLoading}
				columns={columns}
				rowClassName="h-8"
				getRowClassName={(k) => (k.present ? undefined : "opacity-60")}
				emptyText="No keys match. Clear the search or pick another filter."
			/>
			{rows.length > limit && (
				<div className="flex justify-center">
					<TableMore onClick={() => setLimit((l) => l + PAGE)}>
						Show more ({num(rows.length - limit)} left)
					</TableMore>
				</div>
			)}

			<FullNukeDialog
				stripeKey={nuking}
				onOpenChange={(o) => !o && setNuking(null)}
			/>
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
						<span className="text-foreground">Drain.</span> The gate closes, so
						new runs are refused. twd waits for live swarms and nukes to finish.
					</li>
					<li>
						<span className="text-foreground">Delete webhooks.</span> Every
						webhook endpoint on each{" "}
						<span className="font-mono">TW_V3_KEYS</span> key is removed.
					</li>
					<li>
						<span className="text-foreground">Re-register.</span> One Connect
						webhook per usable key, pointed at{" "}
						<span className="font-mono">/ingress/connect/sandbox</span>, then
						keys are re-probed and the gate reopens.
					</li>
				</ol>
				<p className="mt-3 flex items-start gap-2 text-xs">
					<ShieldAlert className="mt-px size-3.5 shrink-0 text-orange-600 dark:text-orange-400" />
					Idempotent and safe to rerun, but it blocks everyone's runs until it
					finishes.
				</p>
			</ConfirmDialog>
		</>
	);
};
