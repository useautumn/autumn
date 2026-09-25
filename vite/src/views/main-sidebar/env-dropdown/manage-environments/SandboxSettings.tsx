import { sandboxSlug, validateSandboxName } from "@autumn/shared";
import {
	Button,
	DialogFooter,
	FormLabel as FieldLabel,
	Input,
	ShortcutButton,
} from "@autumn/ui";
import { format } from "date-fns";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import {
	type SandboxSummary,
	useUpdateSandbox,
} from "@/hooks/queries/useSandboxesQuery";
import {
	setActiveSandbox,
	useActiveSandbox,
} from "@/hooks/sandbox/useActiveSandbox";
import { getBackendErr } from "@/utils/genUtils";
import { IconPicker } from "@/views/settings/sections/components/IconPicker";
import { CopySandboxDialog } from "../CopySandboxDialog";
import { DeleteSandboxDialog } from "../DeleteSandboxDialog";
import { EnvironmentIcon } from "../EnvironmentIcon";
import { SandboxColorSwatches } from "../SandboxColorSwatches";
import { EnvironmentDetailHeader } from "./EnvironmentDetailHeader";
import { renamedSandboxPath } from "./renamedSandboxPath";
import { SandboxSettingRow } from "./SandboxSettingRow";
import type { SandboxDraft } from "./types/sandboxDraft";

export const SandboxSettings = ({
	sandbox,
	sandboxes,
	draft,
	onDraftChange,
	onDraftSaved,
}: {
	sandbox: SandboxSummary;
	sandboxes: SandboxSummary[];
	draft: SandboxDraft;
	onDraftChange: (draft: SandboxDraft) => void;
	onDraftSaved: () => void;
}) => {
	const navigate = useNavigate();
	const location = useLocation();
	const activeSandbox = useActiveSandbox();
	const updateSandbox = useUpdateSandbox();
	const { name, color, icon } = draft;
	const setName = (nextName: string) =>
		onDraftChange({ ...draft, name: nextName });
	const setColor = (nextColor: string) =>
		onDraftChange({ ...draft, color: nextColor });
	const setIcon = (nextIcon: string) =>
		onDraftChange({ ...draft, icon: nextIcon });
	const [importOpen, setImportOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const trimmedName = name.trim();
	const nameChanged = trimmedName !== sandbox.name;
	const hasChanges =
		nameChanged || color !== sandbox.color || icon !== sandbox.icon;
	const canImport = sandboxes.length > 1;

	const handleSave = async () => {
		if (!trimmedName || !hasChanges) {
			return;
		}
		const nameError = nameChanged ? validateSandboxName(trimmedName) : null;
		if (nameError) {
			toast.error(nameError);
			return;
		}

		// Renaming the sandbox you're in changes its URL slug; follow it instead of
		// letting the URL sync fall back to the default sandbox.
		const isActive = activeSandbox?.id === sandbox.id;
		const movesActiveUrl =
			isActive && sandboxSlug(sandbox.name) !== sandboxSlug(trimmedName);
		const nextPath = renamedSandboxPath({
			pathname: location.pathname,
			search: location.search,
			name: trimmedName,
		});

		try {
			await updateSandbox.mutateAsync({
				id: sandbox.id,
				name: trimmedName,
				color,
				icon,
			});
			if (isActive) {
				setActiveSandbox({ id: sandbox.id, name: trimmedName, color, icon });
			}
			if (movesActiveUrl) {
				navigate(nextPath, { replace: true });
			}
			onDraftSaved();
			toast.success("Sandbox updated");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update sandbox"));
		}
	};

	return (
		<>
			<EnvironmentDetailHeader
				icon={
					<EnvironmentIcon
						sandbox={{ icon: sandbox.icon, color: sandbox.color }}
						className="size-4"
					/>
				}
				title={sandbox.name}
				subtitle={`Created ${format(sandbox.created_at, "MMM d, yyyy")}`}
			/>

			<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
				<div className="flex items-end gap-3">
					<div className="flex min-w-0 flex-1 flex-col">
						<FieldLabel>Name</FieldLabel>
						<Input
							aria-label="Sandbox name"
							placeholder="Staging"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</div>
					<div className="flex flex-col">
						<FieldLabel>Icon</FieldLabel>
						<IconPicker value={icon} onChange={setIcon} />
					</div>
				</div>

				<div className="flex flex-col">
					<FieldLabel>Color</FieldLabel>
					<SandboxColorSwatches color={color} onColorChange={setColor} />
				</div>

				<div className="h-px bg-border" />

				<SandboxSettingRow
					title="Import plans & features"
					description={
						canImport
							? "Copy from another sandbox. Matching IDs are overwritten."
							: "Create another sandbox to import from."
					}
					action={
						<Button
							variant="secondary"
							disabled={!canImport}
							onClick={() => setImportOpen(true)}
						>
							Import from…
						</Button>
					}
				/>
				<SandboxSettingRow
					title="Delete sandbox"
					description="Removes its data, API keys and webhooks."
					action={
						<Button
							variant="secondary"
							className="text-red-600 dark:text-red-400"
							onClick={() => setDeleteOpen(true)}
						>
							Delete
						</Button>
					}
				/>
			</div>

			<DialogFooter className="shrink-0 border-t px-5 py-4">
				<ShortcutButton
					variant="primary"
					onClick={handleSave}
					isLoading={updateSandbox.isPending}
					disabled={!trimmedName || !hasChanges}
					metaShortcut="enter"
					className="w-full"
				>
					Save changes
				</ShortcutButton>
			</DialogFooter>

			{importOpen && (
				<CopySandboxDialog
					target={sandbox}
					sandboxes={sandboxes}
					open
					setOpen={setImportOpen}
				/>
			)}
			{deleteOpen && (
				<DeleteSandboxDialog sandbox={sandbox} open setOpen={setDeleteOpen} />
			)}
		</>
	);
};
