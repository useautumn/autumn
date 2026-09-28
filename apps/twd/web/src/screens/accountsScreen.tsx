import { UsersIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
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
import { useLiveTopics } from "../api/live.ts";
import { Actor, ErrorCallout, Pill, StatusDot } from "../components/status.tsx";
import {
	Button,
	ConfirmDialog,
	DataTable,
	Dialog,
	Field,
	PageHeader,
	Panel,
	SectionTag,
	Segmented,
	Skeleton,
} from "../components/ui.tsx";
import { cn, formatDate, num, timeAgo } from "../lib/format.ts";
import { useNow } from "../lib/useNow.ts";

const STATES = [
	{ key: "clean", label: "Clean", tone: "ok", bar: "bg-green-500" },
	{ key: "reserved", label: "Reserved", tone: "info", bar: "bg-blue-500" },
	{ key: "inUse", label: "In use", tone: "info", bar: "bg-blue-500/50" },
	{ key: "nuking", label: "Nuking", tone: "warn", bar: "bg-orange-400" },
	{ key: "broken", label: "Broken", tone: "bad", bar: "bg-red-500" },
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
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						variant="primary"
						disabled={!valid}
						isLoading={create.isPending}
						onClick={submit}
					>
						Reserve {valid ? num(n) : ""}
					</Button>
				</>
			}
		>
			<form
				className="flex flex-col gap-3"
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
					<div className="flex flex-col gap-1.5">
						<span className="text-sm text-tertiary-foreground">
							Expires after
						</span>
						<Segmented
							label="Expiry"
							value={ttl}
							onChange={setTtl}
							options={TTLS.map((t) => ({ value: t, label: t }))}
							className="h-input tabular-nums [&>button]:h-input"
						/>
					</div>
				</div>
				<Field
					label="Note"
					value={note}
					onChange={(e) => setNote(e.target.value)}
					placeholder="What is this for?"
				/>
				<p className="text-xs text-subtle tabular-nums">
					{num(maxClean)} clean accounts available.
				</p>
				<ErrorCallout error={create.error} />
			</form>
		</Dialog>
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
	useLiveTopics("accounts");

	const counts = capacity.data?.accounts;
	const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
	const sorted = [...(reservations.data ?? [])].sort(
		(a, b) =>
			Number(!!a.releasedAt) - Number(!!b.releasedAt) ||
			Date.parse(b.createdAt) - Date.parse(a.createdAt),
	);
	const isActive = (r: Reservation) =>
		!r.releasedAt && Date.parse(r.expiresAt) >= now;
	const brokenAccounts =
		accounts.data?.filter((a) => a.state === "broken") ?? [];

	const columns: ColumnDef<Reservation>[] = [
		{
			id: "owner",
			header: "Owner",
			size: 170,
			cell: ({ row: { original: r } }) => <Actor actor={r.owner} />,
		},
		{
			id: "note",
			header: "Note",
			size: 280,
			meta: { grow: true },
			cell: ({ row: { original: r } }) => (
				<span className="flex min-w-0 items-center gap-2 pr-2">
					<span className="truncate text-foreground">
						{r.note ?? <span className="text-subtle">No note</span>}
					</span>
					<span className="truncate text-tiny-id text-subtle">{r.id}</span>
				</span>
			),
		},
		{
			id: "accounts",
			header: "Accounts",
			size: 90,
			cell: ({ row: { original: r } }) => (
				<span className="tabular-nums">{num(r.accountIds.length)}</span>
			),
		},
		{
			id: "expiry",
			header: "Expiry",
			size: 150,
			cell: ({ row: { original: r } }) => (
				<span className="text-xs tabular-nums">
					{r.releasedAt ? (
						<span className="text-subtle">
							released {timeAgo(r.releasedAt, now)}
						</span>
					) : isActive(r) ? (
						<span title={formatDate(r.expiresAt)}>
							expires{" "}
							<span className="text-foreground">
								{timeAgo(r.expiresAt, now)}
							</span>
						</span>
					) : (
						<Pill>expired</Pill>
					)}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			size: 90,
			cell: ({ row: { original: r } }) =>
				isActive(r) && (
					<span className="flex justify-end">
						<Button
							variant="secondary"
							size="sm"
							onClick={() => setReleasing(r)}
						>
							Release
						</Button>
					</span>
				),
		},
	];

	return (
		<>
			<PageHeader icon={<UsersIcon size={16} weight="fill" />} title="Accounts">
				<Button variant="primary" onClick={() => setCreating(true)}>
					<Plus className="size-3.5" /> Reserve accounts
				</Button>
			</PageHeader>
			<ErrorCallout
				error={capacity.error ?? reservations.error}
				className="mb-4"
			/>

			<SectionTag>Pool</SectionTag>
			<Panel className="mb-6 px-3 py-2.5">
				{counts ? (
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tertiary-foreground tabular-nums">
							{STATES.map((s) => (
								<span key={s.key} className="flex items-center gap-1.5">
									<StatusDot tone={s.tone} />
									{s.label}
									<span className="font-medium text-foreground">
										{num(counts[s.key])}
									</span>
								</span>
							))}
							<span className="ml-auto text-subtle">{num(total)} total</span>
						</div>
						<div className="flex h-1 overflow-hidden rounded-full bg-muted">
							{STATES.map((s) => (
								<div
									key={s.key}
									className={cn(s.bar, "transition-[width] duration-500")}
									style={{
										width: `${(counts[s.key] / Math.max(total, 1)) * 100}%`,
									}}
								/>
							))}
						</div>
						{brokenAccounts.length > 0 && (
							<p className="text-xs text-tertiary-foreground">
								Broken:{" "}
								<span className="text-tiny-id">
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
					</div>
				) : (
					<Skeleton className="h-8 w-full" />
				)}
			</Panel>

			<SectionTag>Reservations</SectionTag>
			<DataTable
				data={reservations.data ? sorted : undefined}
				isLoading={reservations.isLoading}
				columns={columns}
				getRowClassName={(r) => (isActive(r) ? undefined : "opacity-60")}
				emptyText="No reservations. Reserve accounts to pin them for a debugging session or a batch of agent runs."
			/>
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
