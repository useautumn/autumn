import { AppEnv } from "@autumn/shared";
import { Dialog, DialogContent } from "@autumn/ui";
import { useState } from "react";
import type { SandboxSummary } from "@/hooks/queries/useSandboxesQuery";
import { useActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
import { useEnv } from "@/utils/envUtils";
import { BuiltInEnvironmentSummary } from "./BuiltInEnvironmentSummary";
import { EnvironmentList } from "./EnvironmentList";
import { SandboxSettings } from "./SandboxSettings";
import type { EnvironmentSelection } from "./types/environmentSelection";

const useCurrentEnvironmentSelection = (): EnvironmentSelection => {
	const env = useEnv();
	const activeSandbox = useActiveSandbox();
	if (env === AppEnv.Live) {
		return { kind: "production" };
	}
	return activeSandbox
		? { kind: "sandbox", sandboxId: activeSandbox.id }
		: { kind: "defaultSandbox" };
};

const ManageEnvironmentsPanel = ({
	sandboxes,
	isDeployed,
	onCreateSandbox,
}: {
	sandboxes: SandboxSummary[];
	isDeployed: boolean;
	onCreateSandbox: () => void;
}) => {
	const currentSelection = useCurrentEnvironmentSelection();
	const [selection, setSelection] =
		useState<EnvironmentSelection>(currentSelection);

	const selectedSandbox =
		selection.kind === "sandbox"
			? sandboxes.find((sandbox) => sandbox.id === selection.sandboxId)
			: undefined;
	const selectedSandboxWasRemoved =
		selection.kind === "sandbox" && !selectedSandbox;
	const resolvedSelection: EnvironmentSelection = selectedSandboxWasRemoved
		? { kind: "defaultSandbox" }
		: selection;

	return (
		<>
			<EnvironmentList
				sandboxes={sandboxes}
				isDeployed={isDeployed}
				selection={resolvedSelection}
				onSelect={setSelection}
				onCreateSandbox={onCreateSandbox}
			/>
			<section className="flex min-h-0 min-w-0 flex-1 flex-col">
				{selectedSandbox ? (
					<SandboxSettings
						key={selectedSandbox.id}
						sandbox={selectedSandbox}
						sandboxes={sandboxes}
					/>
				) : (
					<BuiltInEnvironmentSummary
						kind={
							resolvedSelection.kind === "production"
								? "production"
								: "defaultSandbox"
						}
					/>
				)}
			</section>
		</>
	);
};

export const ManageEnvironmentsDialog = ({
	open,
	onOpenChange,
	sandboxes,
	isDeployed,
	onCreateSandbox,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sandboxes: SandboxSummary[];
	isDeployed: boolean;
	onCreateSandbox: () => void;
}) => (
	<Dialog open={open} onOpenChange={onOpenChange}>
		<DialogContent
			showCloseButton={false}
			className="flex h-[min(520px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-[760px] flex-col gap-0 overflow-hidden bg-card p-0 sm:flex-row"
		>
			<ManageEnvironmentsPanel
				sandboxes={sandboxes}
				isDeployed={isDeployed}
				onCreateSandbox={onCreateSandbox}
			/>
		</DialogContent>
	</Dialog>
);
