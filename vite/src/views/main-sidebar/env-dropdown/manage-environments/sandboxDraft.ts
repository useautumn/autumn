import type { SandboxSummary } from "@/hooks/queries/useSandboxesQuery";
import type { SandboxDraft } from "./types/sandboxDraft";

export const sandboxToDraft = (sandbox: SandboxSummary): SandboxDraft => ({
	name: sandbox.name,
	color: sandbox.color,
	icon: sandbox.icon,
});

export const isDraftUnsaved = ({
	draft,
	sandbox,
}: {
	draft: SandboxDraft;
	sandbox: SandboxSummary;
}) =>
	draft.name !== sandbox.name ||
	draft.color !== sandbox.color ||
	draft.icon !== sandbox.icon;
