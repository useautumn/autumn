import { Plus } from "lucide-react";
import { useState } from "react";
import type { Reservation } from "../../../src/api/contract.ts";
import {
	useAccounts,
	useCapacity,
	useCreateReservation,
	useReleaseReservation,
	useReservations,
} from "../api/hooks.ts";
import { PageHeader } from "../components/appShell.tsx";
import { Actor, ErrorCallout, Pill, StatusDot } from "../components/status.tsx";
import {
	Button,
	Card,
	ConfirmDialog,
	Dialog,
	Empty,
	Field,
	SectionTitle,
	Segmented,
	Skeleton,
} from "../components/ui.tsx";
import { cn, formatDate, num, timeAgo } from "../lib/format.ts";
import { useNow } from "../lib/useNow.ts";

const STATES = [
	{ key: "clean", label: "Clean", tone: "ok", bar: "bg-ok" },
	{ key: "reserved", label: "Reserved", tone: "info", bar: "bg-info" },
	{ key: "inUse", label: "In use", tone: "info", bar: "bg-info/50" },
	{ key: "nuking", label: "Nuking", tone: "warn", bar: "bg-warn" },
	{ key: "broken", label: "Broken", tone: "bad", bar: "bg-bad" },
] as const;

const TTLS = ["30m", "1h", "2h", "6h", "12h", "24h"];

const CreateReservationDialog = ({
	open,
	onOpenChange,
	maxClean,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	maxClean: number;
}) => {
	const create = useCreateReservation();
	const [count, setCount] = useState("50");
	const [ttl, setTtl] = useState("2h");
	const [note, setNote] = useState("");
	const n = Number(count);
	const valid = Number.isInteger(n) && n >= 1 && n <= 2000;
	const submit = () =>
		create.mutate(
			{ count: n, ttl, note: note.trim() || undefined },
			{
				onSuccess: () => {
					onOpenChange(false);
					create.reset();
				},
			},
		);
	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			title="Reserve accounts"
			description="Pin clean accounts so your runs or local debugging always have them. They're released automatically at expiry."
			footer={
				<>
					<Button onClick={() => onOpenChange(false)}>Cancel</Button>
					<Button
						variant="primary"
						disabled={!valid || create.isPending}
						onClick={submit}
					>
						{create.isPending ? "Reserving…" : `Reserve ${valid ? num(n) : ""}`}
					</Button>
				</>
			}
		>
			<form
				className="space-y-4"
				onSubmit={(e) => {
					e.preventDefault();
					if (valid) submit();
				}}
			>
				<div className="grid grid-cols-[8rem_1fr] gap-3">
					<Field
						label="Accounts"
						type="number"
						min={1}
						max={2000}
						value={count}
						onChange={(e) => setCount(e.target.value)}
						inputClassName="tabular-nums"
					/>
					<div className="space-y-1.5">
						<span className="text-[11px] font-medium text-muted">
							Expires after
						</span>
						<Segmented
							label="Expiry"
							value={ttl}
							onChange={setTtl}
							options={TTLS.map((t) => ({ value: t, label: t }))}
							className="h-8 tabular-nums"
						/>
					</div>
				</div>
				<Field
					label="Note"
					value={note}
					onChange={(e) => setNote(e.target.value)}
					placeholder="What is this for?"
				/>
				<p className="text-xs text-faint tabular-nums">
					{num(maxClean)} clean accounts available.
				</p>
				<ErrorCallout error={create.error} />
			</form>
		</Dialog>
	);
};

const ReservationRow = ({
	r,
	now,
	onRelease,
}: {
	r: Reservation;
	now: number;
	onRelease: () => void;
}) => {
	const expired = Date.parse(r.expiresAt) < now;
	const active = !r.releasedAt && !expired;
	return (
		<div
			className={cn(
				"grid grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_5rem_9rem_7rem] items-center gap-4 border-t border-line px-4 py-2.5 text-xs ",
				!active && "text-muted",
			)}
		>
			<Actor actor={r.owner} />
			<div className="min-w-0">
				<p className="truncate">
					{r.note ?? <span className="text-faint">No note</span>}
				</p>
				<p className="truncate font-mono text-[11px] text-faint">{r.id}</p>
			</div>
			<span className="text-right font-medium tabular-nums">
				{num(r.accountIds.length)}
			</span>
			<span className="tabular-nums">
				{r.releasedAt ? (
					<span className="text-faint">
						released {timeAgo(r.releasedAt, now)}
					</span>
				) : expired ? (
					<Pill>expired</Pill>
				) : (
					<span title={formatDate(r.expiresAt)}>
						expires <span className="text-fg">{timeAgo(r.expiresAt, now)}</span>
					</span>
				)}
			</span>
			<span className="text-right">
				{active && (
					<Button variant="ghost" onClick={onRelease}>
						Release
					</Button>
				)}
			</span>
		</div>
	);
};

export const AccountsScreen = () => {
	const capacity = useCapacity();
	const accounts = useAccounts();
	const reservations = useReservations();
	const release = useReleaseReservation();
	const now = useNow({ intervalMs: 30_000 });
	const [creating, setCreating] = useState(false);
	const [releasing, setReleasing] = useState<Reservation | null>(null);

	const counts = capacity.data?.accounts;
	const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
	const sorted = [...(reservations.data ?? [])].sort(
		(a, b) =>
			Number(!!a.releasedAt) - Number(!!b.releasedAt) ||
			Date.parse(b.createdAt) - Date.parse(a.createdAt),
	);
	const brokenAccounts =
		accounts.data?.filter((a) => a.state === "broken") ?? [];

	return (
		<>
			<PageHeader
				title="Accounts"
				description="Connected Stripe test accounts: clean → reserved → in use → nuking → clean."
				actions={
					<Button variant="primary" onClick={() => setCreating(true)}>
						<Plus /> Reserve accounts
					</Button>
				}
			/>
			<ErrorCallout
				error={capacity.error ?? reservations.error}
				className="mb-5"
			/>

			<Card className="mb-8 p-4">
				{counts ? (
					<>
						<div className="flex h-2 overflow-hidden rounded-full bg-raised">
							{STATES.map((s) => (
								<div
									key={s.key}
									className={s.bar}
									style={{
										width: `${(counts[s.key] / Math.max(total, 1)) * 100}%`,
									}}
								/>
							))}
						</div>
						<div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
							{STATES.map((s) => (
								<div key={s.key}>
									<p className="flex items-center gap-1.5 text-[11px] text-muted">
										<StatusDot tone={s.tone} />
										{s.label}
									</p>
									<p className="mt-1 text-lg font-semibold tabular-nums">
										{num(counts[s.key])}
									</p>
								</div>
							))}
						</div>
						{brokenAccounts.length > 0 && (
							<p className="mt-4 border-t border-line pt-3 text-xs text-muted">
								Broken:{" "}
								<span className="font-mono text-[11px]">
									{brokenAccounts
										.slice(0, 6)
										.map((a) => a.id)
										.join(", ")}
								</span>
								{brokenAccounts.length > 6 &&
									` +${brokenAccounts.length - 6} more`}
								. These need a manual nuke or a key re-initialise.
							</p>
						)}
					</>
				) : (
					<Skeleton className="h-20 w-full" />
				)}
			</Card>

			<SectionTitle>Reservations</SectionTitle>
			<Card className="overflow-hidden">
				<div className="grid h-8 grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_5rem_9rem_7rem] items-center gap-4 bg-raised/50 px-4 text-[11px] font-medium text-muted">
					<span>Owner</span>
					<span>Note</span>
					<span className="text-right">Accounts</span>
					<span>Expiry</span>
					<span />
				</div>
				{reservations.isLoading ? (
					<div className="space-y-2 p-4">
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
					</div>
				) : sorted.length === 0 ? (
					<Empty
						title="No reservations"
						body="Reserve accounts to pin them for a debugging session or a batch of agent runs."
						action={
							<Button onClick={() => setCreating(true)}>
								Reserve accounts
							</Button>
						}
					/>
				) : (
					sorted.map((r) => (
						<ReservationRow
							key={r.id}
							r={r}
							now={now}
							onRelease={() => setReleasing(r)}
						/>
					))
				)}
			</Card>
			<ErrorCallout error={release.error} className="mt-3" />

			<CreateReservationDialog
				open={creating}
				onOpenChange={setCreating}
				maxClean={counts?.clean ?? 0}
			/>
			<ConfirmDialog
				open={releasing !== null}
				onOpenChange={(o) => !o && setReleasing(null)}
				title="Release this reservation?"
				confirmLabel="Release"
				destructive
				pending={release.isPending}
				onConfirm={() =>
					releasing &&
					release.mutate(releasing.id, { onSettled: () => setReleasing(null) })
				}
			>
				{releasing && (
					<>
						{num(releasing.accountIds.length)} accounts held by{" "}
						{releasing.owner.email} go to nuking and return to the clean pool.
						Any run pinned to this reservation loses them.
					</>
				)}
			</ConfirmDialog>
		</>
	);
};
