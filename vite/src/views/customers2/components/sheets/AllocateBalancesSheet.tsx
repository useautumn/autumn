import type {
	ApiCustomerV5,
	BalanceAllocationControl,
	Entity,
} from "@autumn/shared";
import {
	findFeatureById,
	fullCustomerToCustomerEntitlements,
	LATEST_VERSION,
} from "@autumn/shared";
import {
	Button,
	FormLabel,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	ShortcutButton,
} from "@autumn/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	CodeGroup,
	CodeGroupCode,
	CodeGroupCopyButton,
	CodeGroupList,
	CodeGroupTab,
} from "@/components/v2/CodeGroup";
import {
	LayoutGroup,
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
// import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useCustomerAllocationControls } from "../../hooks/useCustomerAllocationControls";
import { getAllocatableSharedBalanceInterval } from "../table/customer-balance/customerBalanceUtils";
import {
	// AllocationUsageWindows,
	allocationStateQueryKey,
} from "./AllocationUsageWindows";

type AmountInputs = Record<string, string>;

const formatCredits = (value: number) => value.toLocaleString();

/** Current shares keyed by public entity id, as text inputs; empty means not allocated. */
const storedAmountInputs = ({
	controls,
	featureId,
	interval,
}: {
	controls: BalanceAllocationControl[];
	featureId?: string;
	interval?: string;
}): AmountInputs => {
	const allocation = controls.find(
		(control) => control.feature_id === featureId,
	);
	if (!allocation || allocation.interval !== interval) return {};
	return Object.fromEntries(
		allocation.allocations.map(({ entity_id, amount }) => [
			entity_id,
			String(amount),
		]),
	);
};

/** Only rows the user changed, in entity list order; a cleared row releases its share. */
const changedAllocations = ({
	entities,
	inputs,
	stored,
}: {
	entities: Entity[];
	inputs: AmountInputs;
	stored: AmountInputs;
}) =>
	entities.flatMap((entity) => {
		if (!entity.id) return [];
		const next = (inputs[entity.id] ?? "").trim();
		const previous = stored[entity.id] ?? "";
		if (next === previous) return [];
		if (next === "")
			return previous === "" ? [] : [{ entity_id: entity.id, amount: 0 }];
		return [{ entity_id: entity.id, amount: Number(next) }];
	});

export function AllocateBalancesSheet() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const sheetData = useSheetStore((s) => s.data);
	const { customer, features } = useCusQuery();
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const queryClient = useQueryClient();
	// const { isAdmin } = useAdmin();

	const fullCustomer = customer;
	const entities = (fullCustomer?.entities ?? []).filter(
		(entity: Entity) => entity.id && !entity.deleted,
	);
	const customerId = customer?.id || customer?.internal_id;
	const [selectedFeatureId, setSelectedFeatureId] = useState<string>();

	const {
		data: apiCustomer,
		isPending,
		isError,
		queryKey,
	} = useCustomerAllocationControls({ customerId });
	const [response, setResponse] = useState<ApiCustomerV5 | null>(null);
	const controls =
		(response ?? apiCustomer)?.billing_controls.balance_allocations ?? [];
	const allocatableFeatures = (features ?? []).flatMap((feature) => {
		const existing = controls.find(
			(control) => control.feature_id === feature.id,
		);
		const sharedInterval = fullCustomer
			? getAllocatableSharedBalanceInterval({
					customerEntitlements: fullCustomerToCustomerEntitlements({
						fullCustomer,
						featureId: feature.id,
					}),
				})
			: undefined;
		const supportedInterval = existing?.interval ?? sharedInterval;
		return supportedInterval
			? [
					{
						featureId: feature.id,
						name: feature.name,
						interval: supportedInterval,
					},
				]
			: [];
	});
	for (const control of controls) {
		if (
			!findFeatureById({
				features: features ?? [],
				featureId: control.feature_id,
			})
		)
			allocatableFeatures.push({
				featureId: control.feature_id,
				name: control.feature_id,
				interval: control.interval,
			});
	}
	const featureId =
		selectedFeatureId ??
		(sheetData?.featureId as string | undefined) ??
		controls[0]?.feature_id ??
		(allocatableFeatures.length === 1
			? allocatableFeatures[0].featureId
			: undefined);
	const featureName = featureId
		? (findFeatureById({ features: features ?? [], featureId })?.name ??
			featureId)
		: undefined;
	const existingControl = controls.find(
		(control) => control.feature_id === featureId,
	);
	const interval =
		existingControl?.interval ??
		allocatableFeatures.find((feature) => feature.featureId === featureId)
			?.interval;
	const stored = storedAmountInputs({ controls, featureId, interval });
	const [editedInputs, setInputs] = useState<AmountInputs | null>(null);
	const inputs = { ...stored, ...editedInputs };
	const [isSubmitting, setIsSubmitting] = useState(false);

	const allocations = changedAllocations({ entities, inputs, stored });

	const handleSubmit = async () => {
		if (!customerId || !featureId || !interval || !apiCustomer) return;
		if (allocations.length === 0) {
			toast.info("No changes to allocate");
			return;
		}
		const invalid = allocations.find(
			(allocation) =>
				!Number.isFinite(allocation.amount) || allocation.amount < 0,
		);
		if (invalid) {
			toast.error(`Enter a number of 0 or more for ${invalid.entity_id}`);
			return;
		}

		setIsSubmitting(true);
		try {
			const { data: freshCustomer } = await axiosInstance.get<ApiCustomerV5>(
				`/v1/customers/${encodeURIComponent(customerId)}`,
			);
			const freshControls =
				freshCustomer.billing_controls.balance_allocations ?? [];
			const freshControl = freshControls.find(
				(control) => control.feature_id === featureId,
			);
			if (freshControl && freshControl.interval !== interval) {
				toast.error(
					"The allocation interval changed. Reopen this sheet to refresh.",
				);
				return;
			}
			const requested = storedAmountInputs({
				controls: freshControls,
				featureId,
				interval,
			});
			for (const { entity_id, amount } of allocations)
				requested[entity_id] = String(amount);
			const featureAllocations = Object.entries(requested).flatMap(
				([entity_id, amount]) =>
					Number(amount) > 0 ? [{ entity_id, amount: Number(amount) }] : [],
			);
			const balanceAllocations = freshControls.filter(
				(control) => control.feature_id !== featureId,
			);
			if (featureAllocations.length)
				balanceAllocations.push({
					feature_id: featureId,
					interval,
					allocations: featureAllocations,
				});
			const { data } = await axiosInstance.post<ApiCustomerV5>(
				"/v1/customers.update",
				{
					customer_id: customerId,
					billing_controls: { balance_allocations: balanceAllocations },
				},
			);
			setResponse(data);
			queryClient.setQueryData(queryKey, data);
			setInputs(null);
			toast.success(`Saved ${featureName} allocations`);
			await queryClient.invalidateQueries({ queryKey: ["customer"] });
			await queryClient.invalidateQueries({
				queryKey: allocationStateQueryKey(customerId),
			});
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to allocate balances"));
		} finally {
			setIsSubmitting(false);
		}
	};

	const formattedJson = response ? JSON.stringify(response, null, 2) : "";
	const effectiveBalance = featureId
		? (response ?? apiCustomer)?.balances[featureId]
		: undefined;

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-hidden">
				<SheetHeader
					title="Allocate to entities"
					description={`Hold part of the shared ${featureName ?? "feature"} credits that reset every ${interval ?? "cycle"} for each entity. Leave a row empty to release its share.`}
				/>
				{!sheetData?.featureId && (
					<SheetSection withSeparator className="space-y-4">
						<div className="flex flex-col gap-2">
							<FormLabel className="mb-0">Feature</FormLabel>
							<Select
								value={featureId}
								disabled={isPending || isSubmitting || isError}
								onValueChange={(value) => {
									setSelectedFeatureId(value);
									setInputs(null);
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select a feature">
										{featureName}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{allocatableFeatures.map(({ featureId: id, name }) => (
										<SelectItem key={id} value={id}>
											{name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<FormLabel className="mb-0">Reset interval</FormLabel>
							<Select value={interval} disabled>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select an interval" />
								</SelectTrigger>
								<SelectContent>
									{interval && (
										<SelectItem value={interval}>{interval}</SelectItem>
									)}
								</SelectContent>
							</Select>
						</div>
					</SheetSection>
				)}

				<SheetSection withSeparator>
					{isPending && (
						<p className="text-xs text-tertiary-foreground">
							Loading requested allocations…
						</p>
					)}
					{isError && (
						<p className="text-xs text-destructive">
							Could not load allocation settings. Reopen this sheet to retry.
						</p>
					)}
					<div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
						{entities.length === 0 && (
							<p className="rounded-lg border border-dashed p-4 text-sm text-tertiary-foreground">
								This customer has no entities.
							</p>
						)}
						{entities.map((entity: Entity) => {
							const entityId = entity.id as string;
							return (
								<div key={entityId} className="flex items-center gap-3 py-1">
									<div className="flex min-w-0 flex-1 flex-col">
										<FormLabel className="mb-0 truncate">
											{entity.name || entityId}
										</FormLabel>
										{entity.name && (
											<span className="truncate text-xs text-tertiary-foreground">
												{entityId}
											</span>
										)}
									</div>
									<Input
										className="w-32"
										type="number"
										min={0}
										placeholder="Not allocated"
										disabled={
											isSubmitting ||
											isPending ||
											isError ||
											!featureId ||
											!interval
										}
										value={inputs[entityId] ?? ""}
										onChange={(event) =>
											setInputs((prev) => ({
												...prev,
												[entityId]: event.target.value,
											}))
										}
									/>
								</div>
							);
						})}
					</div>
				</SheetSection>

				{/* Hidden for QA; restore to show admins the allocation usage windows.
				{isAdmin && (
					<AllocationUsageWindows
						customerId={customerId}
						featureId={featureId}
					/>
				)} */}

				{effectiveBalance && (
					<SheetSection withSeparator>
						<div className="grid grid-cols-4 gap-2 text-xs">
							{(
								[
									["Granted", effectiveBalance.granted],
									["Remaining", effectiveBalance.remaining],
									["Allocated", effectiveBalance.allocated ?? 0],
									[
										"Unallocated",
										effectiveBalance.unallocated ?? effectiveBalance.remaining,
									],
								] as const
							).map(([label, value]) => (
								<div key={label} className="flex flex-col">
									<span className="text-tertiary-foreground">{label}</span>
									<span className="text-sm tabular-nums">
										{formatCredits(value)}
									</span>
								</div>
							))}
						</div>
					</SheetSection>
				)}

				<div className="flex-1 overflow-hidden flex flex-col px-4 py-4">
					{response ? (
						<CodeGroup value="response" className="flex-1 h-0 flex flex-col">
							<CodeGroupList>
								<CodeGroupTab value="response">Response</CodeGroupTab>
								<CodeGroupCopyButton
									onCopy={() => navigator.clipboard.writeText(formattedJson)}
								/>
							</CodeGroupList>
							<div className="flex-1 h-0 overflow-y-auto border border-t-0 rounded-b-lg bg-white dark:bg-background p-4">
								<CodeGroupCode language="json">{formattedJson}</CodeGroupCode>
							</div>
						</CodeGroup>
					) : null}
				</div>

				<SheetFooter>
					<Button
						variant="secondary"
						className="w-full"
						onClick={closeSheet}
						disabled={isSubmitting}
					>
						Close
					</Button>
					<ShortcutButton
						variant="primary"
						className="w-full"
						onClick={handleSubmit}
						isLoading={isSubmitting}
						disabled={
							allocations.length === 0 ||
							isPending ||
							isError ||
							!featureId ||
							!interval
						}
						metaShortcut="enter"
					>
						Allocate
					</ShortcutButton>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
