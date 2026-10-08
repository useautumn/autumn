import { FlaskIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";
import type { QaEnv } from "../../../src/api/contract.ts";
import { useDeleteQaEnv, useQaEnvs } from "../api/hooks.ts";
import { ErrorCallout, Pill, StatusDot } from "../components/status.tsx";
import {
	Button,
	ConfirmDialog,
	PagedDataTable,
	PageHeader,
	Tooltip,
} from "../components/ui.tsx";
import { formatDate, handle, timeAgo } from "../lib/format.ts";
import { useNow } from "../lib/useNow.ts";

const QaState = ({ env }: { env: QaEnv }) => {
	if (env.state === "building")
		return (
			<span className="flex w-full flex-col gap-1">
				<span className="flex items-center gap-1.5 text-xs tabular-nums">
					<Pill tone="info">{env.building?.phase ?? "building"}</Pill>
					{env.building && (
						<span className="text-subtle">
							~{Math.ceil(env.building.remainingMs / 1_000)}s left
						</span>
					)}
				</span>
				<span className="h-0.5 w-full max-w-40 overflow-hidden rounded-full bg-muted">
					<span
						className="block h-full bg-blue-500 transition-[width] duration-500"
						style={{
							width: `${Math.min(100, Math.max(0, env.building?.percent ?? 0))}%`,
						}}
					/>
				</span>
			</span>
		);
	if (env.state === "failed")
		return (
			<Tooltip content={env.error ?? "No error recorded"}>
				<span className="flex min-w-0 items-center gap-1.5">
					<Pill tone="bad">failed</Pill>
					{env.error && (
						<span className="truncate text-xs text-red-600 dark:text-red-400">
							{env.error}
						</span>
					)}
				</span>
			</Tooltip>
		);
	return <Pill tone={env.state === "ready" ? "ok" : "idle"}>{env.state}</Pill>;
};

const Awake = ({ awake }: { awake: boolean | null }) =>
	awake === null ? (
		<span className="text-xs text-subtle">—</span>
	) : (
		<span className="flex items-center gap-1.5 text-xs text-tertiary-foreground">
			<StatusDot tone={awake ? "ok" : "idle"} />
			{awake ? "awake" : "asleep"}
		</span>
	);

export const QaEnvsScreen = () => {
	const envs = useQaEnvs();
	const remove = useDeleteQaEnv();
	const now = useNow({ intervalMs: 30_000 });
	const [deleting, setDeleting] = useState<QaEnv | null>(null);

	const columns: ColumnDef<QaEnv>[] = [
		{
			id: "name",
			header: "Name",
			size: 220,
			cell: ({ row: { original: e } }) => (
				<span className="flex min-w-0 items-center gap-2">
					<span className="truncate text-sm text-foreground">{e.name}</span>
					<a
						href={e.url}
						target="_blank"
						rel="noreferrer"
						title={e.url}
						onClick={(ev) => ev.stopPropagation()}
						className="inline-flex shrink-0 items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
					>
						Open
						<ExternalLink className="size-3" />
					</a>
				</span>
			),
		},
		{
			id: "ref",
			header: "Ref",
			size: 220,
			cell: ({ row: { original: e } }) => (
				<span
					className="block truncate text-tiny-id text-tertiary-foreground"
					title={`${e.ref}@${e.sha}`}
				>
					{e.ref}@{e.sha.slice(0, 12)}
				</span>
			),
		},
		{
			id: "state",
			header: "State",
			size: 240,
			meta: { grow: true },
			cell: ({ row: { original: e } }) => <QaState env={e} />,
		},
		{
			id: "awake",
			header: "Container",
			size: 90,
			cell: ({ row: { original: e } }) => <Awake awake={e.awake} />,
		},
		{
			id: "createdBy",
			header: "Created by",
			size: 110,
			cell: ({ row: { original: e } }) => (
				<span
					className="block truncate text-xs text-tertiary-foreground"
					title={`${e.createdBy} · ${formatDate(e.createdAt)}`}
				>
					{handle(e.createdBy)}
				</span>
			),
		},
		{
			id: "expires",
			header: "Expires",
			size: 90,
			cell: ({ row: { original: e } }) => (
				<span
					className="text-xs text-subtle tabular-nums"
					title={formatDate(e.expiresAt)}
				>
					{timeAgo(e.expiresAt, now)}
				</span>
			),
		},
		{
			id: "lastActive",
			header: "Last active",
			size: 90,
			cell: ({ row: { original: e } }) => (
				<span
					className="text-xs text-subtle tabular-nums"
					title={formatDate(e.lastActiveAt)}
				>
					{timeAgo(e.lastActiveAt, now)}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			size: 60,
			cell: ({ row: { original: e } }) => (
				<span className="flex justify-end">
					<Tooltip content="Delete env">
						<Button
							variant="secondary"
							size="sm"
							aria-label={`Delete ${e.name}`}
							isLoading={remove.isPending && remove.variables === e.name}
							onClick={() => setDeleting(e)}
						>
							<Trash2 className="size-3.5" />
						</Button>
					</Tooltip>
				</span>
			),
		},
	];

	return (
		<>
			<PageHeader
				icon={<FlaskIcon size={16} weight="fill" />}
				title="QA envs"
			/>
			<ErrorCallout error={envs.error ?? remove.error} className="mb-4" />
			<PagedDataTable
				fill
				resetKey=""
				data={envs.data}
				isLoading={envs.isLoading}
				columns={columns}
				emptyText="No QA envs. Agents create one per branch with POST /qa."
			/>

			<ConfirmDialog
				open={deleting !== null}
				onOpenChange={(o) => !o && setDeleting(null)}
				title="Delete this QA env?"
				confirmLabel="Delete"
				destructive
				pending={remove.isPending}
				onConfirm={() =>
					deleting &&
					remove.mutate(deleting.name, {
						onSettled: () => setDeleting(null),
					})
				}
			>
				{deleting && (
					<>
						<span className="font-mono text-foreground">{deleting.name}</span>{" "}
						stops its container, removes{" "}
						<span className="font-mono text-foreground">{deleting.url}</span>{" "}
						and deletes its Neon branch, so any QA data on it is gone.
					</>
				)}
			</ConfirmDialog>
		</>
	);
};
