import { Button } from "@autumn/ui";
import { ShadowAtomMachineForm } from "./ShadowAtomMachineForm";
import { ShadowAtomSecret } from "./ShadowAtomSecret";
import { ShadowAtomStatusChip } from "./ShadowAtomStatusChip";
import type {
	ShadowAtomCreated,
	ShadowAtomDeployment,
	ShadowAtomMachine,
} from "./shadowAtomTypes";

const Field = ({ label, value }: { label: string; value: string }) => (
	<div className="flex min-w-0 flex-col gap-0.5">
		<span className="text-[11px] uppercase tracking-wide text-subtle">
			{label}
		</span>
		<span className="truncate font-mono text-xs text-foreground">{value}</span>
	</div>
);

/** Our shadow Atom: where it stands on alien, and create / resize / delete. */
export const ShadowAtomDeploymentCard = ({
	deployment,
	created,
	onCreate,
	onResize,
	onDelete,
	isCreating,
	isResizing,
	isDeleting,
	isBusy,
}: {
	deployment: ShadowAtomDeployment | null;
	created: ShadowAtomCreated | null;
	onCreate: (machine: ShadowAtomMachine) => void;
	onResize: (machine: ShadowAtomMachine) => void;
	onDelete: () => void;
	isCreating: boolean;
	isResizing: boolean;
	isDeleting: boolean;
	/** Any create, resize or delete in flight: every action waits for it. */
	isBusy: boolean;
}) => (
	<div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
		<div className="flex flex-wrap items-center justify-between gap-2">
			<ShadowAtomStatusChip status={deployment?.status ?? null} />
			{deployment && (
				<Button
					variant="destructive"
					size="sm"
					onClick={onDelete}
					isLoading={isDeleting}
					disabled={isBusy}
				>
					Delete
				</Button>
			)}
		</div>

		{deployment && (
			<div className="grid gap-3 sm:grid-cols-3">
				<Field label="Endpoint" value={deployment.endpoint_url ?? "—"} />
				<Field
					label="Machine"
					value={
						deployment.machine
							? `${deployment.machine.cpu} vCPU · ${deployment.machine.memory} GiB`
							: "—"
					}
				/>
				<Field
					label="Deployment group"
					value={deployment.deployment_group_id}
				/>
			</div>
		)}

		{created && (
			<div className="flex flex-col gap-2">
				<ShadowAtomSecret
					label="Admin token hash"
					value={created.adminTokenHash}
					hint="Shown once. alien already has it as ATOM_ADMIN_TOKEN_HASH; a new create rotates it."
				/>
				{created.setupUrl && (
					<a
						href={created.setupUrl}
						target="_blank"
						rel="noreferrer"
						className="text-xs text-primary underline underline-offset-2"
					>
						Open the AWS quick-create link
					</a>
				)}
			</div>
		)}

		{deployment ? (
			<ShadowAtomMachineForm
				key={deployment.deployment_group_id}
				current={deployment.machine}
				submitLabel="Resize"
				onSubmit={onResize}
				isSaving={isResizing}
				disabled={isBusy}
			/>
		) : (
			<ShadowAtomMachineForm
				current={null}
				submitLabel="Create"
				onSubmit={onCreate}
				isSaving={isCreating}
				disabled={isBusy}
			/>
		)}
	</div>
);
