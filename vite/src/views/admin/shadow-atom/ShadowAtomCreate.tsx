import {
	type ByocCacheMachine,
	DEFAULT_BYOC_CACHE_MACHINE,
} from "@autumn/shared";
import { Button } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
} from "@/components/general/table";
import { getBackendErr } from "@/utils/genUtils";
import { AtomMachineTable } from "@/views/settings/sections/components/atom/AtomMachineTable";
import type { AtomActions } from "@/views/settings/sections/components/atom/useAtomActions";

/** Nothing deployed: pick its machine, and creating it opens the quick-create link for our own AWS account. */
export const ShadowAtomCreate = ({ actions }: { actions: AtomActions }) => {
	const [machine, setMachine] = useState<ByocCacheMachine>(
		DEFAULT_BYOC_CACHE_MACHINE,
	);
	const create = () =>
		actions
			.startSetup({ cpu: machine.cpu, memory: machine.memory })
			.catch((error) =>
				toast.error(getBackendErr(error, "Failed to create the shadow Atom")),
			);

	return (
		<div className="flex flex-col gap-3">
			<div className={TABLE_TRAY_CLASS}>
				<div className={TABLE_TRAY_SURFACE_CLASS}>
					<AtomMachineTable
						selected={machine}
						onSelect={setMachine}
						disabled={actions.create.isPending}
					/>
				</div>
			</div>
			<Button
				variant="primary"
				className="self-end"
				onClick={create}
				isLoading={actions.create.isPending}
			>
				Create shadow Atom
			</Button>
		</div>
	);
};
