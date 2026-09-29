import type { SandboxSummary } from "@/hooks/queries/useSandboxesQuery";
import type { SandboxDraft } from "./types/sandboxDraft";

export const sandboxToDraft = (sandbox: SandboxSummary): SandboxDraft => ({
	name: sandbox.name,
	color: sandbox.color,
	icon: sandbox.icon,
});

export const isSameDraft = ({
	draft,
	other,
}: {
	draft: SandboxDraft;
	other: SandboxDraft;
}) =>
	draft.name === other.name &&
	draft.color === other.color &&
	draft.icon === other.icon;

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
