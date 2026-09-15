import {
	Alert,
	AlertDescription,
	Button,
	DialogFooter,
	Input,
	Switch,
} from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { BalanceShadowCustomerRow } from "./BalanceShadowCustomerRow";
import {
	BALANCE_SHADOW_MAX_CUSTOMERS,
	BALANCE_SHADOW_QUERY_KEY,
	type BalanceShadowConfig,
	buildBalanceShadowConfig,
	createBalanceShadowCustomerRow,
	getBalanceShadowFormValues,
} from "./balanceShadowConfig";
import { edgeConfigStatusQueryKey } from "./EdgeConfigCard";

const runFields = [
	{
		name: "runId",
		label: "Run ID",
		description: "A unique name for this test run.",
	},
	{
		name: "ownershipTopic",
		label: "Shadow ownership topic",
		description:
			"Use the shadow worker's ownership topic, separate from direct routing.",
	},
	{
		name: "expiresAt",
		label: "Expires at (your local time)",
		description:
			"Within the next 24 hours. Keep the run shorter than the cohort's next reset or expiry.",
	},
] as const;

export function BalanceShadowConfigForm({
	config,
	onClose,
}: {
	config: BalanceShadowConfig;
	onClose: () => void;
}) {
	const id = useId();
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [defaultValues] = useState(() =>
		getBalanceShadowFormValues({ config }),
	);
	const mutation = useMutation({
		mutationFn: async (nextConfig: BalanceShadowConfig) => {
			await axiosInstance.put("/admin/balance-shadow-config", nextConfig);
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: BALANCE_SHADOW_QUERY_KEY }),
				queryClient.invalidateQueries({
					queryKey: edgeConfigStatusQueryKey({ configId: "balance-shadow" }),
				}),
			]);
			toast.success("Balance Shadow config saved");
			onClose();
		},
	});
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: ({ value }) => {
				const result = buildBalanceShadowConfig({ values: value });
				return result.success ? undefined : result.error;
			},
		},
		onSubmit: ({ value }) => {
			const result = buildBalanceShadowConfig({ values: value });
			if (result.success) mutation.mutate(result.config);
		},
	});
	const enabled = useStore(form.store, (state) => state.values.enabled);
	const isDirty = useStore(form.store, (state) => state.isDirty);
	const errors = useStore(form.store, (state) => state.errors);

	return (
		<form
			noValidate
			className="flex min-h-0 flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (!mutation.isPending) void form.handleSubmit();
			}}
		>
			<fieldset
				disabled={mutation.isPending}
				className="flex min-h-0 flex-col gap-5 overflow-y-auto"
			>
				<Alert>
					<AlertDescription>
						Copies only: the existing balance engine still answers live
						requests. Initialize these customers in the shadow worker separately
						and confirm it is ready before starting traffic.
					</AlertDescription>
				</Alert>
				<form.Field name="enabled">
					{(field) => (
						<div className="flex items-center justify-between gap-4">
							<div className="flex flex-col gap-1">
								<label
									className="text-sm font-medium"
									htmlFor={`${id}-enabled`}
								>
									Enable shadow copies
								</label>
								<p
									id={`${id}-enabled-hint`}
									className="text-xs text-tertiary-foreground"
								>
									Turning off clears the saved run. Nothing changes until you
									save.
								</p>
							</div>
							<Switch
								id={`${id}-enabled`}
								aria-describedby={`${id}-enabled-hint`}
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</div>
					)}
				</form.Field>
				<fieldset
					disabled={!enabled}
					className="flex min-w-0 flex-col gap-4 disabled:opacity-60"
				>
					<legend className="sr-only">Shadow run</legend>
					{runFields.map(({ name, label, description }) => (
						<form.Field key={name} name={name}>
							{(field) => (
								<div className="flex flex-col gap-1.5">
									<label
										className="text-sm font-medium"
										htmlFor={`${id}-${name}`}
									>
										{label}
									</label>
									<Input
										id={`${id}-${name}`}
										type={name === "expiresAt" ? "datetime-local" : "text"}
										step={name === "expiresAt" ? "any" : undefined}
										maxLength={name === "expiresAt" ? undefined : 200}
										value={field.state.value}
										autoComplete="off"
										aria-describedby={`${id}-${name}-hint`}
										onBlur={field.handleBlur}
										onChange={(event) => field.handleChange(event.target.value)}
									/>
									<p
										id={`${id}-${name}-hint`}
										className="text-xs text-tertiary-foreground"
									>
										{description}
									</p>
								</div>
							)}
						</form.Field>
					))}
					<form.Field name="customers" mode="array">
						{(field) => (
							<div className="flex flex-col gap-3">
								<div className="flex items-center justify-between gap-3">
									<h3 className="text-sm font-medium text-foreground">
										Customer cohort
									</h3>
									<span className="text-xs tabular-nums text-tertiary-foreground">
										{field.state.value.length} / {BALANCE_SHADOW_MAX_CUSTOMERS}{" "}
										entries
									</span>
								</div>
								{field.state.value.map((customer, index) => (
									<BalanceShadowCustomerRow
										key={customer.rowId}
										customer={customer}
										index={index}
										onChange={(next) => field.replaceValue(index, next)}
										onRemove={() => field.removeValue(index)}
									/>
								))}
								<Button
									type="button"
									variant="secondary"
									disabled={
										field.state.value.length >= BALANCE_SHADOW_MAX_CUSTOMERS
									}
									onClick={() =>
										field.pushValue(createBalanceShadowCustomerRow())
									}
								>
									<Plus aria-hidden="true" /> Add customer-feature entry
								</Button>
							</div>
						)}
					</form.Field>
				</fieldset>
			</fieldset>
			{errors.length > 0 && (
				<p role="alert" className="text-sm text-destructive">
					{errors.join(" ")}
				</p>
			)}
			{mutation.error && (
				<p role="alert" className="text-sm text-destructive">
					{getBackendErr(
						mutation.error,
						"Could not confirm the save. Your edits are preserved; retry or reopen to check the saved config.",
					)}
				</p>
			)}
			<DialogFooter className="shrink-0">
				<Button
					type="button"
					variant="secondary"
					onClick={onClose}
					disabled={mutation.isPending}
				>
					Cancel
				</Button>
				<Button
					type="submit"
					variant="primary"
					isLoading={mutation.isPending}
					disabled={!isDirty || mutation.isPending}
				>
					Save
				</Button>
			</DialogFooter>
		</form>
	);
}
