import { UsersIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import type { StripeAccount } from "../../../src/api/contract.ts";
import {
	useAccounts,
	useCapacity,
	useForgetAccount,
	useNukeAccounts,
} from "../api/hooks.ts";
import { useLiveTopics } from "../api/live.ts";
import { ErrorCallout, StatusDot } from "../components/status.tsx";
import {
	Button,
	ConfirmDialog,
	PagedDataTable,
	PageHeader,
	Panel,
	SectionTag,
	Skeleton,
	Tooltip,
} from "../components/ui.tsx";
import { cn, formatDate, num, timeAgo } from "../lib/format.ts";
import { useNow } from "../lib/useNow.ts";

const STATES = [
	{ key: "clean", label: "Clean", tone: "ok", bar: "bg-green-500" },
	{ key: "inUse", label: "In use", tone: "info", bar: "bg-blue-500" },
	{ key: "nuking", label: "Nuking", tone: "warn", bar: "bg-orange-400" },
	{ key: "broken", label: "Broken", tone: "bad", bar: "bg-red-500" },
] as const;

export const AccountsScreen = () => {
	const capacity = useCapacity();
	const accounts = useAccounts();
	const now = useNow({ intervalMs: 30_000 });
	const nuke = useNukeAccounts();
	const forget = useForgetAccount();
	const [forgetting, setForgetting] = useState<StripeAccount | null>(null);
	useLiveTopics("accounts");

	const cap = capacity.data;
	const counts = cap?.accounts;
	const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
	const brokenAccounts = accounts.data
		?.filter((a) => a.state === "broken")
		.sort(
			(a, b) => Date.parse(b.stateChangedAt) - Date.parse(a.stateChangedAt),
		);

	const brokenColumns: ColumnDef<StripeAccount>[] = [
		{
			id: "account",
			header: "Account",
			size: 150,
			cell: ({ row: { original: a } }) => (
				<span className="text-tiny-id text-foreground">{a.id}</span>
			),
		},
		{
			id: "key",
			header: "Key",
			size: 190,
			cell: ({ row: { original: a } }) => (
				<span className="block truncate text-tiny-id text-tertiary-foreground">
					{a.platformAccountId}
				</span>
			),
		},
		{
			id: "reason",
			header: "Reason",
			size: 320,
			meta: { grow: true },
			cell: ({ row: { original: a } }) =>
				a.brokenReason ? (
					<Tooltip content={a.brokenReason}>
						<span className="block truncate pr-2 text-xs text-red-600 dark:text-red-400">
							{a.brokenReason}
						</span>
					</Tooltip>
				) : (
					<span className="text-xs text-subtle">No reason recorded</span>
				),
		},
		{
			id: "when",
			header: "Broken",
			size: 90,
			cell: ({ row: { original: a } }) => (
				<span
					className="text-xs text-subtle tabular-nums"
					title={formatDate(a.stateChangedAt)}
				>
					{timeAgo(a.stateChangedAt, now)}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			size: 170,
			cell: ({ row: { original: a } }) => (
				<span className="flex justify-end gap-1.5">
					<Button
						variant="secondary"
						size="sm"
						isLoading={nuke.isPending && nuke.variables?.includes(a.id)}
						onClick={() => nuke.mutate([a.id])}
					>
						Retry nuke
					</Button>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setForgetting(a)}
					>
						Forget
					</Button>
				</span>
			),
		},
	];

	return (
		<>
			<PageHeader
				icon={<UsersIcon size={16} weight="fill" />}
				title="Accounts"
			/>
			<ErrorCallout error={capacity.error ?? accounts.error} className="mb-4" />

			<SectionTag>Pool</SectionTag>
			<Panel className="mb-6 shrink-0 px-3 py-2.5">
				{cap && counts ? (
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
						<p className="text-xs text-subtle tabular-nums">
							{cap.queuedRuns > 0 &&
								`${cap.queuedRuns} run${cap.queuedRuns === 1 ? "" : "s"} queued for accounts · `}
							{num(cap.accountsWanted)} more wanted by live runs ·{" "}
							{cap.slotsAwaitingWarm > 0 &&
								`${num(cap.slotsAwaitingWarm)} more once warm builds finish · `}
							pool cap {num(cap.poolCap)}
						</p>
					</div>
				) : (
					<Skeleton className="h-8 w-full" />
				)}
			</Panel>

			<SectionTag>Broken accounts</SectionTag>
			<PagedDataTable
				fill
				resetKey=""
				data={brokenAccounts}
				isLoading={accounts.isLoading}
				columns={brokenColumns}
				emptyText="No broken accounts. Accounts land here when a nuke or verify fails."
			/>
			<ErrorCallout
				error={nuke.error ?? forget.error}
				className="mt-3 shrink-0"
			/>

			<ConfirmDialog
				open={forgetting !== null}
				onOpenChange={(o) => !o && setForgetting(null)}
				title="Forget this account?"
				confirmLabel="Forget"
				destructive
				pending={forget.isPending}
				onConfirm={() =>
					forgetting &&
					forget.mutate(forgetting.id, {
						onSettled: () => setForgetting(null),
					})
				}
			>
				{forgetting && (
					<>
						<span className="font-mono text-foreground">{forgetting.id}</span>{" "}
						is removed from twd's ledger only. Nothing is deleted in Stripe: if
						the account still exists there, it stays, and twd will no longer
						nuke or hand it to runs. Use this for accounts already deleted in
						Stripe.
					</>
				)}
			</ConfirmDialog>
		</>
	);
};
