import { AppEnv, type Feature, FeatureType } from "@autumn/shared";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
	ToolbarButton,
} from "@autumn/ui";
import { ArchiveRestore, Copy, Delete, Pen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	type SandboxSummary,
	useCopySandbox,
	useSandboxesQuery,
} from "@/hooks/queries/useSandboxesQuery";
import { useActiveSandbox } from "@/hooks/sandbox/useActiveSandbox";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import UpdateFeatureSheet from "../components/UpdateFeatureSheet";
import UpdateCreditSystemSheet from "../credit-systems/components/UpdateCreditSystemSheet";
import { DeleteFeatureDialog } from "../feature-row-toolbar/DeleteFeatureDialog";

export const FeatureListRowToolbar = ({ feature }: { feature: Feature }) => {
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const [updateOpen, setUpdateOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const activeSandbox = useActiveSandbox();
	const env = useEnv();
	const inNamedSandbox = env === AppEnv.Sandbox && !!activeSandbox;
	const { sandboxes } = useSandboxesQuery({ enabled: inNamedSandbox });
	const copySandbox = useCopySandbox();

	const otherSandboxes = sandboxes.filter((s) => s.id !== activeSandbox?.id);

	const isCreditSystem = feature.type === FeatureType.CreditSystem;

	const handleCopyToSandbox = async (target: SandboxSummary) => {
		if (!inNamedSandbox || !activeSandbox) return;
		setDropdownOpen(false);
		try {
			await copySandbox.mutateAsync({
				fromSandboxId: activeSandbox.id,
				toSandboxId: target.id,
				featureIds: [feature.id],
			});
			toast.success(`Copied ${feature.name} to ${target.name}`);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to copy feature"));
		}
	};

	const deleteText = feature.archived ? "Unarchive" : "Delete";
	const DeleteIcon = feature.archived ? ArchiveRestore : Delete;

	return (
		<>
			{isCreditSystem ? (
				<UpdateCreditSystemSheet
					open={updateOpen}
					setOpen={setUpdateOpen}
					selectedCreditSystem={feature}
				/>
			) : (
				<UpdateFeatureSheet
					open={updateOpen}
					setOpen={setUpdateOpen}
					selectedFeature={feature}
				/>
			)}
			<DeleteFeatureDialog
				feature={feature}
				open={deleteOpen}
				setOpen={setDeleteOpen}
				dropdownOpen={dropdownOpen}
			/>

			<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
				<DropdownMenuTrigger asChild>
					<ToolbarButton />
				</DropdownMenuTrigger>
				<DropdownMenuContent className="text-muted-foreground" align="end">
					{inNamedSandbox && otherSandboxes.length > 0 && (
						<>
							<DropdownMenuSub>
								<DropdownMenuSubTrigger className="flex items-center gap-2 text-xs">
									<Copy size={12} className="text-tertiary-foreground" />
									Copy to
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent>
									{otherSandboxes.map((s) => (
										<DropdownMenuItem
											key={s.id}
											className="flex items-center text-xs"
											onClick={(e) => {
												e.stopPropagation();
												e.preventDefault();
												handleCopyToSandbox(s);
											}}
										>
											{s.name}
										</DropdownMenuItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
							<DropdownMenuSeparator />
						</>
					)}
					<DropdownMenuItem
						className="flex items-center text-xs"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							setDropdownOpen(false);
							setUpdateOpen(true);
						}}
					>
						<div className="flex items-center justify-between w-full gap-2">
							Edit
							<Pen size={12} className="text-tertiary-foreground" />
						</div>
					</DropdownMenuItem>
					<DropdownMenuItem
						className="flex items-center text-xs"
						onClick={(e) => {
							e.stopPropagation();
							e.preventDefault();
							setDropdownOpen(false);
							setDeleteOpen(true);
						}}
					>
						<div className="flex items-center justify-between w-full gap-2">
							{deleteText}
							<DeleteIcon size={12} className="text-tertiary-foreground" />
						</div>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
};
