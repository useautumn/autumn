import { Button, DialogFooter } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	DB_CONTROL_LIMITS,
	DB_CONTROL_QUERY_KEY,
	type DbControlConfig,
} from "./dbControlConfigTypes";
import { edgeConfigStatusQueryKey } from "./EdgeConfigCard";

export const DbControlConfigForm = ({
	config,
	onClose,
}: {
	config: DbControlConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async (
			nextConfig: Pick<DbControlConfig, "balanceCommitter">,
		) => {
			await axiosInstance.put("/admin/db-control-config", nextConfig);
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: DB_CONTROL_QUERY_KEY }),
				queryClient.invalidateQueries({
					queryKey: edgeConfigStatusQueryKey({ configId: "db-control" }),
				}),
			]);
			toast.success("DB control config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save DB control config"));
		},
	});
	const form = useAppForm({
		defaultValues: {
			concurrency: config.balanceCommitter.concurrency as number | null,
		},
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync({
				balanceCommitter: { concurrency: value.concurrency },
			});
		},
	});
	const isDirty = useStore(form.store, (state) => state.isDirty);

	return (
		<>
			<div className="flex flex-col gap-6">
				<form.AppField name="concurrency">
					{(field) => (
						<field.NumberField
							label="Balance committer concurrency"
							description="Flushes in flight per balance worker. Leave blank to use the worker's pool size; a value above the pool size is clamped to it."
							min={DB_CONTROL_LIMITS.concurrency.min}
							max={DB_CONTROL_LIMITS.concurrency.max}
							inputClassName="tabular-nums"
						/>
					)}
				</form.AppField>
			</div>
			<DialogFooter>
				<Button variant="secondary" onClick={onClose}>
					Cancel
				</Button>
				<Button
					onClick={() => void form.handleSubmit()}
					disabled={!isDirty || mutation.isPending}
					isLoading={mutation.isPending}
				>
					Save
				</Button>
			</DialogFooter>
		</>
	);
};
