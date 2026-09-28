import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@autumn/ui/components/ui/dropdown-menu";
import { KeyIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import {
	Bomb,
	Check,
	ChevronDown,
	Loader2,
	MoreHorizontal,
	Plus,
	RefreshCw,
	ShieldAlert,
	Trash2,
	X,
} from "lucide-react";
import { useState } from "react";
import type { Job, StripeKey } from "../../../src/api/contract.ts";
import {
	type ReinitRequest,
	useImportKeys,
	useJobs,
	useKeys,
	useProbeKeys,
	useReinitKeys,
	useRemoveKey,
} from "../api/hooks.ts";
import { useLiveTopics } from "../api/live.ts";
import { ErrorCallout, Pill } from "../components/status.tsx";
import {
	Button,
	ConfirmDialog,
	DataTable,
	Dialog,
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
	const [removing, setRemoving] = useState<StripeKey | null>(null);
	const [importing, setImporting] = useState(false);
	const [picking, setPicking] = useState(false);
	const remove = useRemoveKey();
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
			busy: acc.busy + k.accounts.inUse + k.accounts.nuking,
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
						{!k.present && <Pill tone="warn">removed</Pill>}
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
				["held", "In use", (k: StripeKey) => k.accounts.inUse],
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
							<DropdownMenuItem
								disabled={!k.present || draining}
								onClick={() =>
									reinit.mutate({
										scope: "selected",
										platformAccountIds: [k.platformAccountId],
									})
								}
							>
								<RefreshCw className="size-3.5" />
								Re-initialise this key
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={!k.present || k.accounts.inUse > 0}
								onClick={() => setRemoving(k)}
							>
								<Trash2 className="size-3.5" />
								Remove key…
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
				<Button variant="primary" onClick={() => setImporting(true)}>
					<Plus className="size-3.5" /> Import keys
				</Button>
				<Button
					variant="secondary"
					disabled={draining}
					isLoading={probe.isPending}
					onClick={() => probe.mutate()}
				>
					<RefreshCw className="size-3.5" /> Probe keys
				</Button>
				<ReinitMenu
					keys={all}
					disabled={draining}
					pending={reinit.isPending}
					onRun={(request) => reinit.mutate(request)}
					onAll={() => setConfirm(true)}
					onPick={() => setPicking(true)}
				/>
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
			<ImportKeysDialog open={importing} onOpenChange={setImporting} />
			<PickKeysDialog
				open={picking}
				onOpenChange={setPicking}
				keys={all}
				pending={reinit.isPending}
				onConfirm={(platformAccountIds) =>
					reinit.mutate(
						{ scope: "selected", platformAccountIds },
						{ onSuccess: () => setPicking(false) },
					)
				}
			/>
			<ConfirmDialog
				open={removing !== null}
				onOpenChange={(open) => !open && setRemoving(null)}
				title="Remove this key from twd?"
				confirmLabel="Remove key"
				destructive
				pending={remove.isPending}
				onConfirm={() =>
					removing &&
					remove.mutate(removing.platformAccountId, {
						onSuccess: () => setRemoving(null),
					})
				}
			>
				<p>
					<span className="text-tiny-id">{removing?.keyHint}</span> stops being
					used for runs and its stored secret is deleted. Nothing changes in
					Stripe; re-import the key to use it again.
				</p>
				<ErrorCallout error={remove.error} className="mt-3" />
			</ConfirmDialog>
			<ConfirmDialog
				open={confirm}
				onOpenChange={setConfirm}
				title="Re-initialise every Stripe key (drain)?"
				confirmLabel="Drain and re-initialise"
				pending={reinit.isPending}
				onConfirm={() =>
					reinit.mutate(
						{ scope: "all" },
						{ onSettled: () => setConfirm(false) },
					)
				}
			>
				<ol className="list-decimal space-y-1.5 pl-4">
					<li>
						<span className="text-foreground">Drain.</span> The gate closes, so
						new runs are refused. twd waits for live swarms and nukes to finish.
					</li>
					<li>
						<span className="text-foreground">Delete webhooks.</span> Every
						webhook endpoint on every stored key is removed.
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
					Blocks everyone's runs until it finishes. Only needed when twd's
					public URL changes; for new or broken keys use the scoped options
					instead.
				</p>
			</ConfirmDialog>
		</>
	);
};

const ImportKeysDialog = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const importKeys = useImportKeys();
	const [text, setText] = useState("");
	const result = importKeys.data;
	const close = (next: boolean) => {
		onOpenChange(next);
		if (!next) {
			setText("");
			importKeys.reset();
		}
	};
	return (
		<Dialog
			open={open}
			onOpenChange={close}
			title="Import Stripe keys"
			description="Paste platform secret keys separated by commas, spaces, or new lines. Keys twd already has are skipped, so you can paste the same list again safely."
			footer={
				result ? (
					<Button variant="primary" onClick={() => close(false)}>
						Done
					</Button>
				) : (
					<>
						<Button variant="secondary" onClick={() => close(false)}>
							Cancel
						</Button>
						<Button
							variant="primary"
							disabled={text.trim().length === 0}
							isLoading={importKeys.isPending}
							onClick={() => importKeys.mutate(text)}
						>
							Import
						</Button>
					</>
				)
			}
		>
			{result ? (
				<div className="flex flex-col gap-2 text-sm">
					<p className="text-foreground">
						Added {result.added} · {result.usable} usable ·{" "}
						{result.alreadyPresent} already in twd
					</p>
					{result.unusable.length > 0 && (
						<ul className="max-h-40 overflow-auto rounded-md border border-border p-2 text-xs">
							{result.unusable.map((key) => (
								<li key={key.keyHint} className="flex gap-2">
									<span className="text-tiny-id">{key.keyHint}</span>
									<span className="text-red-600 dark:text-red-400">
										{key.reason}
									</span>
								</li>
							))}
						</ul>
					)}
					<p className="text-xs text-subtle">
						Run Re-initialise so new keys get their Connect webhook and
						accounts.
					</p>
				</div>
			) : (
				<>
					<textarea
						value={text}
						onChange={(event) => setText(event.target.value)}
						placeholder="sk_test_…, sk_test_…"
						spellCheck={false}
						className="h-40 w-full resize-none rounded-md border border-border bg-transparent p-2 font-mono text-xs outline-none focus:border-primary"
					/>
					{importKeys.isPending && (
						<p className="mt-2 text-xs text-subtle">
							Probing each new key with Stripe…
						</p>
					)}
					<ErrorCallout error={importKeys.error} className="mt-3" />
				</>
			)}
		</Dialog>
	);
};

const ReinitMenu = ({
	keys,
	disabled,
	pending,
	onRun,
	onAll,
	onPick,
}: {
	keys: StripeKey[];
	disabled: boolean;
	pending: boolean;
	onRun: (request: ReinitRequest) => void;
	onAll: () => void;
	onPick: () => void;
}) => {
	const live = keys.filter((k) => k.present);
	const missing = live.filter((k) => k.usable && !k.webhookRegistered).length;
	const unhealthy = live.filter(
		(k) => !k.usable || !k.webhookRegistered,
	).length;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled || pending}
				className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-sm hover:bg-muted disabled:opacity-50"
			>
				{pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
				Re-initialise
				<ChevronDown className="size-3.5 text-subtle" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				<ReinitOption
					title="Missing webhooks"
					detail="Register a webhook on usable keys that lack one. No drain."
					count={missing}
					onClick={() => onRun({ scope: "missing_webhooks" })}
				/>
				<ReinitOption
					title="New / unhealthy keys"
					detail="Re-probe, add missing webhooks, top up accounts. No drain."
					count={unhealthy}
					onClick={() => onRun({ scope: "unhealthy" })}
				/>
				<ReinitOption
					title="Selected keys…"
					detail="Pick keys; only runs on those keys are waited for."
					onClick={onPick}
				/>
				<DropdownMenuSeparator />
				<ReinitOption
					title="Everything (drain)"
					detail="Pauses all runs. Use when twd's URL changes."
					onClick={onAll}
					destructive
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

const ReinitOption = ({
	title,
	detail,
	count,
	onClick,
	destructive,
}: {
	title: string;
	detail: string;
	count?: number;
	onClick: () => void;
	destructive?: boolean;
}) => (
	<DropdownMenuItem
		disabled={count === 0}
		onClick={onClick}
		className="flex flex-col items-start gap-0.5 py-1.5"
	>
		<span
			className={cn(
				"flex w-full items-center justify-between text-sm",
				destructive && "text-red-600 dark:text-red-400",
			)}
		>
			{title}
			{count !== undefined && (
				<span className="text-xs text-subtle">{count}</span>
			)}
		</span>
		<span className="text-xs text-subtle">{detail}</span>
	</DropdownMenuItem>
);

const PickKeysDialog = ({
	open,
	onOpenChange,
	keys,
	pending,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	keys: StripeKey[];
	pending: boolean;
	onConfirm: (platformAccountIds: string[]) => void;
}) => {
	const [query, setQuery] = useState("");
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const q = query.trim().toLowerCase();
	const shown = keys
		.filter((k) => k.present)
		.filter(
			(k) =>
				!q ||
				k.keyHint.toLowerCase().includes(q) ||
				k.platformAccountId.toLowerCase().includes(q) ||
				(k.displayName ?? "").toLowerCase().includes(q),
		)
		.slice(0, 200);
	const toggle = (id: string) =>
		setPicked((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) setPicked(new Set());
			}}
			title="Re-initialise selected keys"
			description="Each selected key is locked, waits for its own runs to finish, gets its webhooks replaced, and is topped up. Other keys keep serving runs."
			footer={
				<>
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant="primary"
						disabled={picked.size === 0}
						isLoading={pending}
						onClick={() => onConfirm([...picked])}
					>
						Re-initialise {picked.size || ""}
					</Button>
				</>
			}
		>
			<SearchInput
				value={query}
				onChange={setQuery}
				placeholder="acct_…, sk_test_…, name"
			/>
			<ul className="mt-2 max-h-72 overflow-auto rounded-md border border-border">
				{shown.map((k) => (
					<li key={k.platformAccountId}>
						<label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted">
							<input
								type="checkbox"
								checked={picked.has(k.platformAccountId)}
								onChange={() => toggle(k.platformAccountId)}
							/>
							<span className="text-tiny-id">{k.keyHint}</span>
							<span className="truncate text-subtle">
								{k.displayName ?? k.platformAccountId}
							</span>
							{!k.usable && <Pill tone="bad">unusable</Pill>}
							{k.usable && !k.webhookRegistered && (
								<Pill tone="warn">no webhook</Pill>
							)}
						</label>
					</li>
				))}
			</ul>
		</Dialog>
	);
};
