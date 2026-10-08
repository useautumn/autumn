import type { ApiByocCache } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { CpuIcon } from "@phosphor-icons/react";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";
import { AtomMachineTable } from "./AtomMachineTable";
import { ATOM_RESIZE_NOTE } from "./atomMachineDisplay";
import { ResizeAtomDialog } from "./ResizeAtomDialog";
import type { useAtomActions } from "./useAtomActions";
import { useAtomMachineForm } from "./useAtomMachineForm";

export const AtomMachineSection = ({
	cache,
	resize,
}: {
	cache: ApiByocCache;
	resize: ReturnType<typeof useAtomActions>["resize"];
}) => {
	const {
		form,
		current,
		selected,
		isUnchanged,
		selectMachine,
		isConfirmOpen,
		setConfirmOpen,
		confirmResize,
	} = useAtomMachineForm({ cache, resize });

	return (
		<>
			<form
				className="flex flex-col gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					form.handleSubmit();
				}}
			>
				<div className="flex items-center gap-2 px-2 text-[15px] text-muted-foreground">
					<CpuIcon className="size-4 text-subtle" />
					Machine size
				</div>
				<div className={TABLE_TRAY_CLASS}>
					<div className={TABLE_TRAY_SURFACE_CLASS}>
						<AtomMachineTable
							selected={selected}
							current={current}
							onSelect={selectMachine}
							disabled={resize.isPending}
						/>
					</div>
				</div>
				<div className="flex items-center justify-between gap-4">
					<p className="max-w-[420px] text-xs text-tertiary-foreground">
						{ATOM_RESIZE_NOTE}
					</p>
					<div className="flex shrink-0 gap-2">
						<Button
							type="button"
							variant="secondary"
							disabled={isUnchanged}
							onClick={() => form.reset()}
						>
							Cancel
						</Button>
						<Button type="submit" variant="primary" disabled={isUnchanged}>
							Resize
						</Button>
					</div>
				</div>
			</form>
			<ResizeAtomDialog
				open={isConfirmOpen}
				onOpenChange={setConfirmOpen}
				current={current}
				target={selected}
				onConfirm={confirmResize}
			/>
		</>
	);
};
