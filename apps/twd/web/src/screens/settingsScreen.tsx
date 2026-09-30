import { CopyIconButton } from "@autumn/ui/components/general/copy-button";
import { GearIcon } from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { ApiKey } from "../../../src/api/contract.ts";
import { twdOrigin } from "../api/client.ts";
import {
	useApiKeys,
	useCreateApiKey,
	useMe,
	useRefreshBranches,
	useRevokeApiKey,
} from "../api/hooks.ts";
import { ErrorCallout, Pill } from "../components/status.tsx";
import {
	Button,
	ConfirmDialog,
	DataTable,
	Dialog,
	Field,
	PageHeader,
	Panel,
	SectionTag,
} from "../components/ui.tsx";
import { formatDate, timeAgo } from "../lib/format.ts";

const CodeBlock = ({ code }: { code: string }) => (
	<div className="relative">
		<pre className="rounded-lg border bg-card px-3 py-2 pr-9 font-mono break-all whitespace-pre-wrap text-[11px] leading-relaxed text-foreground">
			{code}
		</pre>
		<div className="absolute top-1.5 right-2">
			<CopyIconButton text={code} />
		</div>
	</div>
);

const CopyField = ({ text }: { text: string }) => (
	<div className="flex h-input items-center gap-2 rounded-lg border bg-card pr-2 pl-2.5">
		<code className="min-w-0 flex-1 truncate text-tiny-id text-foreground">
			{text}
		</code>
		<CopyIconButton text={text} />
	</div>
);

const CreateKeyDialog = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
}) => {
	const create = useCreateApiKey();
	const [name, setName] = useState("");
	const close = (o: boolean) => {
		onOpenChange(o);
		if (!o) {
			setName("");
			create.reset();
		}
	};
	if (create.data)
		return (
			<Dialog
				open={open}
				onOpenChange={close}
				title="Copy your new API key"
				description="This is the only time the secret is shown. Store it in your agent's or CI's secret manager."
				footer={
					<Button variant="primary" onClick={() => close(false)}>
						Done
					</Button>
				}
			>
				<CopyField text={create.data.secret} />
			</Dialog>
		);
	return (
		<Dialog
			open={open}
			onOpenChange={close}
			title="Create API key"
			description="Keys act as you: every run started with it is recorded as yours, via this key."
			footer={
				<>
					<Button variant="secondary" onClick={() => close(false)}>
						Cancel
					</Button>
					<Button
						variant="primary"
						disabled={!name.trim()}
						isLoading={create.isPending}
						onClick={() => create.mutate(name.trim())}
					>
						Create key
					</Button>
				</>
			}
		>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (name.trim()) create.mutate(name.trim());
				}}
			>
				<Field
					label="Name"
					autoFocus
					maxLength={80}
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="e.g. capy agent, github actions"
				/>
				<ErrorCallout error={create.error} className="mt-3" />
			</form>
		</Dialog>
	);
};

export const SettingsScreen = () => {
	const me = useMe();
	const keys = useApiKeys();
	const revoke = useRevokeApiKey();
	const [creating, setCreating] = useState(false);
	const [revoking, setRevoking] = useState<ApiKey | null>(null);
	const origin = twdOrigin;
	const sorted = [...(keys.data ?? [])].sort(
		(a, b) => Number(!!a.revokedAt) - Number(!!b.revokedAt),
	);

	const columns: ColumnDef<ApiKey>[] = [
		{
			id: "name",
			header: "Name",
			size: 200,
			meta: { grow: true },
			cell: ({ row: { original: k } }) => (
				<span className="flex min-w-0 items-center gap-2">
					<span className="truncate font-medium text-foreground">{k.name}</span>
					{k.revokedAt && <Pill>revoked</Pill>}
				</span>
			),
		},
		{
			id: "prefix",
			header: "Key",
			size: 110,
			cell: ({ row: { original: k } }) => (
				<span className="text-tiny-id text-tertiary-foreground">
					{k.prefix}…
				</span>
			),
		},
		{
			id: "owner",
			header: "Owner",
			size: 170,
			cell: ({ row: { original: k } }) => (
				<span className="block truncate text-xs">{k.ownerEmail}</span>
			),
		},
		{
			id: "used",
			header: "Last used",
			size: 110,
			cell: ({ row: { original: k } }) => (
				<span className="text-xs text-subtle tabular-nums">
					{k.revokedAt
						? `revoked ${timeAgo(k.revokedAt)}`
						: timeAgo(k.lastUsedAt)}
				</span>
			),
		},
		{
			id: "created",
			header: "Created",
			size: 120,
			cell: ({ row: { original: k } }) => (
				<span className="text-xs text-subtle tabular-nums">
					{formatDate(k.createdAt)}
				</span>
			),
		},
		{
			id: "actions",
			header: "",
			size: 80,
			cell: ({ row: { original: k } }) =>
				!k.revokedAt && (
					<span className="flex justify-end">
						<Button
							variant="secondary"
							size="sm"
							onClick={() => setRevoking(k)}
						>
							Revoke
						</Button>
					</span>
				),
		},
	];

	return (
		<>
			<PageHeader icon={<GearIcon size={16} weight="fill" />} title="Settings">
				{me.data && (
					<span className="text-xs text-subtle">
						Signed in as {me.data.email}
					</span>
				)}
			</PageHeader>
			<div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<section className="min-w-0">
					<div className="flex items-center justify-between pb-2">
						<SectionTag className="mb-0">API keys</SectionTag>
						<Button variant="primary" onClick={() => setCreating(true)}>
							<Plus className="size-3.5" /> Create key
						</Button>
					</div>
					<DataTable
						data={keys.data ? sorted : undefined}
						isLoading={keys.isLoading}
						columns={columns}
						getRowClassName={(k) => (k.revokedAt ? "opacity-60" : undefined)}
						emptyText="No API keys yet. Create one for an agent or CI job to call twd as you."
					/>
					<ErrorCallout error={keys.error ?? revoke.error} className="mt-3" />
				</section>

				<BranchCacheSection />

				<section>
					<SectionTag>For agents</SectionTag>
					<Panel className="flex flex-col gap-3 p-3 text-sm">
						<p className="text-pretty text-tertiary-foreground">
							twd speaks MCP over streamable HTTP with the same auth and actions
							as the REST API. Errors carry a{" "}
							<span className="text-tiny-id text-foreground">next</span> step
							and an{" "}
							<span className="text-tiny-id text-foreground">escalate</span>{" "}
							note when a human is needed.
						</p>
						<div className="flex flex-col gap-1.5">
							<span className="text-xs text-subtle">MCP server URL</span>
							<CopyField text={`${origin}/mcp`} />
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="text-xs text-subtle">Start a run with curl</span>
							<CodeBlock
								code={`curl -X POST ${origin}/api/runs \\
  -H "Authorization: Bearer $TWD_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{"branch":"my-branch","selection":{"groups":["core"]}}'`}
							/>
						</div>
						<p className="text-xs text-subtle">
							Tools:{" "}
							<span className="text-tiny-id">
								get_capacity · start_run · wait_for_run · get_run · list_catalog
							</span>
						</p>
					</Panel>
				</section>
			</div>

			<CreateKeyDialog open={creating} onOpenChange={setCreating} />
			<ConfirmDialog
				open={revoking !== null}
				onOpenChange={(o) => !o && setRevoking(null)}
				title={`Revoke “${revoking?.name ?? ""}”?`}
				confirmLabel="Revoke key"
				destructive
				pending={revoke.isPending}
				onConfirm={() =>
					revoking &&
					revoke.mutate(revoking.id, { onSettled: () => setRevoking(null) })
				}
			>
				Anything using{" "}
				<span className="font-mono text-foreground">{revoking?.prefix}…</span>{" "}
				gets 401 on its next request. This can't be undone.
			</ConfirmDialog>
		</>
	);
};

const BranchCacheSection = () => {
	const refresh = useRefreshBranches();
	return (
		<section>
			<SectionTag>Branches</SectionTag>
			<Panel className="flex items-center justify-between gap-3 p-3 text-sm">
				<p className="text-pretty text-tertiary-foreground">
					Open PRs are cached for a minute to stay under GitHub&apos;s anonymous
					rate limit. Refresh if a new PR is missing from the branch picker.
				</p>
				<Button
					variant="secondary"
					size="sm"
					isLoading={refresh.isPending}
					onClick={() => refresh.mutate()}
				>
					{refresh.isSuccess
						? `Refreshed · ${refresh.data.length} branches`
						: "Refresh branches"}
				</Button>
			</Panel>
			<ErrorCallout error={refresh.error} className="mt-3" />
		</section>
	);
};
