import { InfoIcon } from "@phosphor-icons/react";
import { useRoleMutations, useRolesQuery } from "@/hooks/queries/useRolesQuery";
import { SettingsTable } from "@/views/settings/SettingsTable";
import { DeleteRoleDialog } from "./DeleteRoleDialog";
import { RoleFormSheet } from "./RoleFormSheet";
import { RoleRow } from "./RoleRow";
import { RolesLoadError } from "./RolesLoadError";
import type { RoleBody } from "./roleAccess";
import { getRoleInUseCount } from "./rolesClient";
import type { RoleDialogs } from "./useRoleDialogs";

const COLUMNS = [
	{ label: "Role", width: "30%" },
	{ label: "Access", width: "50%" },
	{ label: "Members", width: "15%" },
] as const;

export const RolesTab = ({
	dialogs,
	readOnly,
}: {
	dialogs: RoleDialogs;
	readOnly: boolean;
}) => {
	const { roles, isLoading, error, refetch } = useRolesQuery();
	const { save, remove } = useRoleMutations();
	const close = () => dialogs.setOpen(false);

	const handleSave = ({ body }: { body: RoleBody }) =>
		save.mutate(
			{ name: dialogs.role?.name ?? null, body },
			{ onSuccess: close },
		);

	const handleDelete = () => {
		if (!dialogs.role) return;
		remove.mutate({ name: dialogs.role.name }, { onSuccess: close });
	};

	if (isLoading) return null;
	if (error) return <RolesLoadError onRetry={() => refetch()} />;

	return (
		<>
			<SettingsTable columns={COLUMNS}>
				{roles.map((role) => (
					<RoleRow
						key={role.name}
						role={role}
						readOnly={readOnly}
						onEdit={() => dialogs.openEditor({ role })}
						onDelete={() => {
							remove.reset();
							dialogs.openDelete({ role });
						}}
					/>
				))}
			</SettingsTable>
			<p className="mt-4 flex items-center gap-1.5 text-xs text-tertiary-foreground">
				<InfoIcon className="size-3.5 shrink-0" />
				Roles set what each person can see and edit. Limits on changes live in
				Billing → Approvals.
			</p>
			<RoleFormSheet
				key={dialogs.nonce}
				role={dialogs.role}
				open={dialogs.dialog === "editor"}
				onOpenChange={dialogs.setOpen}
				onSubmit={handleSave}
				isSaving={save.isPending}
				readOnly={readOnly}
			/>
			<DeleteRoleDialog
				role={dialogs.role}
				open={dialogs.dialog === "delete"}
				onOpenChange={dialogs.setOpen}
				onConfirm={handleDelete}
				isDeleting={remove.isPending}
				inUseCount={getRoleInUseCount({ error: remove.error })}
			/>
		</>
	);
};
