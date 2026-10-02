import type {
	ApiCustomerV5,
	BalanceAllocationControl,
	Entity,
	FullCustomer,
} from "@autumn/shared";
import { LATEST_VERSION, ResetInterval } from "@autumn/shared";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
// import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
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
	const { customer } = useCusQuery();
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();
	// const { isAdmin } = useAdmin();

	const fullCustomer = customer as FullCustomer | null;
	const entities = (fullCustomer?.entities ?? []).filter(
		(entity: Entity) => entity.id && !entity.deleted,
	);
	const customerId = customer?.id || customer?.internal_id;
	const [selectedFeatureId, setSelectedFeatureId] = useState<string>();
	const [selectedInterval, setSelectedInterval] =
		useState<BalanceAllocationControl["interval"]>();
	const featureId =
		selectedFeatureId ?? (sheetData?.featureId as string | undefined);
	const featureName =
		(sheetData?.featureName as string | undefined) ?? featureId;

	const {
		data: apiCustomer,
		isPending,
		isError,
	} = useQuery({
		queryKey: buildKey(["customer-allocation-config", customerId]),
		queryFn: async () =>
			(
				await axiosInstance.get<ApiCustomerV5>(
					`/v1/customers/${encodeURIComponent(customerId ?? "")}`,
				)
			).data,
		enabled: !!customerId,
	});
	const [response, setResponse] = useState<ApiCustomerV5 | null>(null);
	const controls =
		(response ?? apiCustomer)?.billing_controls.balance_allocations ?? [];
	const interval =
		selectedInterval ??
		(sheetData?.interval as BalanceAllocationControl["interval"] | undefined);
	const stored = storedAmountInputs({ controls, featureId, interval });
	const [editedInputs, setInputs] = useState<AmountInputs | null>(null);
	const inputs = editedInputs ?? stored;
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
			const requested = { ...stored };
			for (const { entity_id, amount } of allocations)
				requested[entity_id] = String(amount);
			const featureAllocations = Object.entries(requested).flatMap(
				([entity_id, amount]) =>
					Number(amount) > 0 ? [{ entity_id, amount: Number(amount) }] : [],
			);
			const balanceAllocations = controls.filter(
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
			queryClient.setQueryData(
				buildKey(["customer-allocation-config", customerId]),
				data,
			);
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
									setSelectedInterval(
										controls.find((control) => control.feature_id === value)
											?.interval,
									);
									setInputs(null);
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select a feature" />
								</SelectTrigger>
								<SelectContent>
									{Object.keys(apiCustomer?.balances ?? {}).map((id) => (
										<SelectItem key={id} value={id}>
											{id}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<FormLabel className="mb-0">Reset interval</FormLabel>
							<Select
								value={interval}
								disabled={isSubmitting || !featureId}
								onValueChange={(value) => {
									setSelectedInterval(
										value as BalanceAllocationControl["interval"],
									);
									setInputs(null);
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select an interval" />
								</SelectTrigger>
								<SelectContent>
									{Object.values(ResetInterval)
										.filter((value) => value !== ResetInterval.OneOff)
										.map((value) => (
											<SelectItem key={value} value={value}>
												{value}
											</SelectItem>
										))}
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
												...(prev ?? stored),
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
