import {
	type ApiByocCache,
	type ByocCacheMachine,
	DEFAULT_BYOC_CACHE_MACHINE,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { getBackendErr } from "@/utils/genUtils";
import { atomMachineLabel, cacheToMachine } from "./atomMachineDisplay";
import type { useAtomActions } from "./useAtomActions";

/** The picked machine is a form value; submitting only opens the confirm, which does the resize. */
export const useAtomMachineForm = ({
	cache,
	resize,
}: {
	cache: ApiByocCache;
	resize: ReturnType<typeof useAtomActions>["resize"];
}) => {
	const current = cacheToMachine(cache);
	const [isConfirmOpen, setConfirmOpen] = useState(false);

	const form = useAppForm({
		defaultValues: {
			instanceType: (current ?? DEFAULT_BYOC_CACHE_MACHINE).instanceType,
		},
		onSubmit: () => setConfirmOpen(true),
	});

	const instanceType = useStore(
		form.store,
		(state) => state.values.instanceType,
	);
	const selected =
		findByocCacheMachineByInstanceType({ instanceType }) ??
		DEFAULT_BYOC_CACHE_MACHINE;
	const isUnchanged = selected.instanceType === current?.instanceType;

	const selectMachine = (machine: ByocCacheMachine) =>
		form.setFieldValue("instanceType", machine.instanceType);

	const confirmResize = async (): Promise<void> => {
		try {
			await resize.mutateAsync(selected);
			setConfirmOpen(false);
			form.reset({ instanceType: selected.instanceType });
			toast.success(
				`Resizing to ${atomMachineLabel(selected)}. Checks fall back to the Autumn API until it is back.`,
			);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to resize Atom"));
		}
	};

	return {
		form,
		current,
		selected,
		isUnchanged,
		selectMachine,
		isConfirmOpen,
		setConfirmOpen,
		confirmResize,
	};
};
