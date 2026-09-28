import { Check, Copy, KeyRound, Plus } from "lucide-react";
import { useState } from "react";
import type { ApiKey } from "../../../src/api/contract.ts";
import { twdOrigin } from "../api/client.ts";
import {
	useApiKeys,
	useCreateApiKey,
	useMe,
	useRevokeApiKey,
} from "../api/hooks.ts";
import { PageHeader } from "../components/appShell.tsx";
import { ErrorCallout, Pill } from "../components/status.tsx";
import {
	Button,
	Card,
	ConfirmDialog,
	Dialog,
	Empty,
	Field,
	SectionTitle,
	Skeleton,
} from "../components/ui.tsx";
import { cn, formatDate, timeAgo } from "../lib/format.ts";

const useCopy = () => {
	const [copied, setCopied] = useState<string | null>(null);
	const copy = (id: string, text: string) =>
		navigator.clipboard.writeText(text).then(() => {
			setCopied(id);
			setTimeout(() => setCopied((c) => (c === id ? null : c)), 1_500);
		});
	return { copied, copy };
};

const CopyButton = ({
	copyKey,
	text,
	copier,
}: {
	copyKey: string;
	text: string;
	copier: ReturnType<typeof useCopy>;
}) => (
	<Button
		variant="ghost"
		size="icon"
		aria-label="Copy"
		onClick={() => copier.copy(copyKey, text)}
	>
		{copier.copied === copyKey ? <Check className="text-ok" /> : <Copy />}
	</Button>
);

const CodeBlock = ({
	copyKey,
	code,
	copier,
}: {
	copyKey: string;
	code: string;
	copier: ReturnType<typeof useCopy>;
}) => (
	<div className="group relative">
		<pre className="rounded-md border border-line bg-bg px-3 py-2.5 pr-10 font-mono break-all whitespace-pre-wrap text-[11.5px] leading-relaxed text-fg">
			{code}
		</pre>
		<div className="absolute top-1.5 right-1.5">
			<CopyButton copyKey={copyKey} text={code} copier={copier} />
		</div>
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
	const copier = useCopy();
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
				<div className="flex items-center gap-2 rounded-md border border-line bg-bg py-1 pr-1 pl-3">
					<code className="min-w-0 flex-1 truncate font-mono text-xs">
						{create.data.secret}
					</code>
					<CopyButton
						copyKey="secret"
						text={create.data.secret}
						copier={copier}
					/>
				</div>
			</Dialog>
		);
	return (
		<Dialog
			open={open}
			onOpenChange={close}
			title="Create API key"
			description="Keys act as you: every run or reservation made with it is recorded as yours, via this key."
			footer={
				<>
					<Button onClick={() => close(false)}>Cancel</Button>
					<Button
						variant="primary"
						disabled={!name.trim() || create.isPending}
						onClick={() => create.mutate(name.trim())}
					>
						{create.isPending ? "Creating…" : "Create key"}
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
	const copier = useCopy();
	const [creating, setCreating] = useState(false);
	const [revoking, setRevoking] = useState<ApiKey | null>(null);
	const origin = twdOrigin;
	const sorted = [...(keys.data ?? [])].sort(
		(a, b) => Number(!!a.revokedAt) - Number(!!b.revokedAt),
	);

	return (
		<>
			<PageHeader
				title="Settings"
				description={me.data ? `Signed in as ${me.data.email}` : undefined}
			/>
			<div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
				<section>
					<SectionTitle
						right={
							<Button variant="primary" onClick={() => setCreating(true)}>
								<Plus /> Create key
							</Button>
						}
					>
						API keys
					</SectionTitle>
					<Card className="overflow-hidden">
						{keys.isLoading ? (
							<div className="space-y-2 p-4">
								<Skeleton className="h-8 w-full" />
								<Skeleton className="h-8 w-full" />
							</div>
						) : sorted.length === 0 ? (
							<Empty
								title="No API keys yet"
								body="Create one for an agent or CI job to call twd as you."
								action={
									<Button onClick={() => setCreating(true)}>Create key</Button>
								}
							/>
						) : (
							sorted.map((k) => (
								<div
									key={k.id}
									className={cn(
										"flex items-center gap-4 border-t border-line px-4 py-3 first:border-t-0 ",
										k.revokedAt && "text-muted",
									)}
								>
									<KeyRound className="size-4 shrink-0 text-faint" />
									<div className="min-w-0 flex-1">
										<p className="flex items-center gap-2 text-[13px] font-medium">
											{k.name}
											{k.revokedAt && <Pill>revoked</Pill>}
										</p>
										<p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
											<span className="font-mono">{k.prefix}…</span>
											<span>{k.ownerEmail}</span>
											<span>created {formatDate(k.createdAt)}</span>
											<span>
												{k.revokedAt
													? `revoked ${timeAgo(k.revokedAt)}`
													: `last used ${timeAgo(k.lastUsedAt)}`}
											</span>
										</p>
									</div>
									{!k.revokedAt && (
										<Button variant="ghost" onClick={() => setRevoking(k)}>
											Revoke
										</Button>
									)}
								</div>
							))
						)}
					</Card>
					<ErrorCallout error={keys.error ?? revoke.error} className="mt-3" />
				</section>

				<section>
					<SectionTitle>For agents</SectionTitle>
					<Card className="space-y-4 p-4 text-[13px]">
						<p className="text-pretty text-muted">
							twd speaks MCP over streamable HTTP with the same auth and actions
							as the REST API. Errors carry a{" "}
							<span className="font-mono text-fg">next</span> step and an{" "}
							<span className="font-mono text-fg">escalate</span> note when a
							human is needed.
						</p>
						<div>
							<p className="mb-1.5 text-[11px] font-medium text-muted">
								MCP server URL
							</p>
							<div className="flex items-center gap-2 rounded-md border border-line bg-bg py-1 pr-1 pl-3">
								<code className="min-w-0 flex-1 truncate font-mono text-xs">
									{origin}/mcp
								</code>
								<CopyButton
									copyKey="mcp"
									text={`${origin}/mcp`}
									copier={copier}
								/>
							</div>
						</div>
						<div>
							<p className="mb-1.5 text-[11px] font-medium text-muted">
								Start a run with curl
							</p>
							<CodeBlock
								copyKey="curl"
								copier={copier}
								code={`curl -X POST ${origin}/runs \\
  -H "Authorization: Bearer $TWD_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{"branch":"my-branch","selection":{"groups":["core"]}}'`}
							/>
						</div>
						<p className="text-xs text-faint">
							Tools:{" "}
							<span className="font-mono">
								get_capacity · start_run · wait_for_run · get_run ·
								reserve_accounts · list_catalog
							</span>
						</p>
					</Card>
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
				<span className="font-mono text-fg">{revoking?.prefix}…</span> gets 401
				on its next request. This can't be undone.
			</ConfirmDialog>
		</>
	);
};
