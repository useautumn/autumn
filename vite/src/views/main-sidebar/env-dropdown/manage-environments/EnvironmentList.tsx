import { DialogTitle } from "@autumn/ui";
import { Plus } from "lucide-react";
import type { SandboxSummary } from "@/hooks/queries/useSandboxesQuery";
import { EnvironmentIcon } from "../EnvironmentIcon";
import { EnvironmentListItem } from "./EnvironmentListItem";
import type { EnvironmentSelection } from "./types/environmentSelection";

export const EnvironmentList = ({
	sandboxes,
	isDeployed,
	selection,
	unsavedSandboxIds,
	onSelect,
	onCreateSandbox,
}: {
	sandboxes: SandboxSummary[];
	isDeployed: boolean;
	selection: EnvironmentSelection;
	unsavedSandboxIds: Set<string>;
	onSelect: (selection: EnvironmentSelection) => void;
	onCreateSandbox: () => void;
}) => {
	const isSelectedSandbox = (sandboxId: string) =>
		selection.kind === "sandbox" && selection.sandboxId === sandboxId;

	return (
		<nav
			aria-label="Environments"
			className="flex max-h-[40%] w-full shrink-0 flex-col border-b bg-background sm:max-h-none sm:w-56 sm:border-r sm:border-b-0"
		>
			<DialogTitle className="px-4 pt-4 pb-3 text-sm font-semibold text-foreground">
				Environments
			</DialogTitle>
			<div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
				{isDeployed && (
					<EnvironmentListItem
						icon={<EnvironmentIcon isLive className="size-3.5" />}
						name="Production"
						isSelected={selection.kind === "production"}
						onSelect={() => onSelect({ kind: "production" })}
					/>
				)}
				<EnvironmentListItem
					icon={<EnvironmentIcon className="size-3.5" />}
					name="Sandbox"
					isSelected={selection.kind === "defaultSandbox"}
					onSelect={() => onSelect({ kind: "defaultSandbox" })}
				/>
				{sandboxes.length > 0 && (
					<p className="px-2 pt-3 pb-1 text-xs font-medium text-tertiary-foreground">
						Custom sandboxes
					</p>
				)}
				{sandboxes.map((sandbox) => (
					<EnvironmentListItem
						key={sandbox.id}
						icon={<EnvironmentIcon sandbox={sandbox} className="size-3.5" />}
						name={sandbox.name}
						isSelected={isSelectedSandbox(sandbox.id)}
						hasUnsavedChanges={unsavedSandboxIds.has(sandbox.id)}
						onSelect={() =>
							onSelect({ kind: "sandbox", sandboxId: sandbox.id })
						}
					/>
				))}
			</div>
			<div className="p-2">
				<button
					className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm text-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-foreground/[0.04] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
					onClick={onCreateSandbox}
					type="button"
				>
					<Plus className="size-3.5" />
					New sandbox
				</button>
			</div>
		</nav>
	);
};
