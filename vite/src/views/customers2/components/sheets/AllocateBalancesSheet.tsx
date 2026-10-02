import type {
	AllocateBalancesResponse,
	Entity,
	FullCustomer,
} from "@autumn/shared";
import { LATEST_VERSION } from "@autumn/shared";
import { Button, FormLabel, Input, ShortcutButton } from "@autumn/ui";
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
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

type AmountInputs = Record<string, string>;

const formatCredits = (value: number) => value.toLocaleString();

/** Current shares keyed by public entity id, as text inputs; empty means not allocated. */
const storedAmountInputs = ({
	fullCustomer,
	entities,
	internalFeatureId,
	interval,
}: {
	fullCustomer: FullCustomer | null;
	entities: Entity[];
	internalFeatureId?: string;
	interval?: string;
}): AmountInputs => {
	const allocation = internalFeatureId
		? fullCustomer?.balance_allocations?.[internalFeatureId]
		: undefined;
	if (!allocation || allocation.interval !== interval) return {};
	return Object.fromEntries(
		entities.flatMap((entity) => {
			const amount = allocation.amounts[entity.internal_id];
			return entity.id && amount !== undefined
				? [[entity.id, String(amount)]]
				: [];
		}),
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

	const fullCustomer = customer as FullCustomer | null;
	const entities = (fullCustomer?.entities ?? []).filter(
		(entity: Entity) => entity.id && !entity.deleted,
	);
	const customerId = customer?.id || customer?.internal_id;
	const featureId = sheetData?.featureId as string | undefined;
	const featureName =
		(sheetData?.featureName as string | undefined) ?? featureId;
	const internalFeatureId = sheetData?.internalFeatureId as string | undefined;
	const interval = sheetData?.interval as string | undefined;

	const [stored, setStored] = useState<AmountInputs>(() =>
		storedAmountInputs({ fullCustomer, entities, internalFeatureId, interval }),
	);
	const [inputs, setInputs] = useState<AmountInputs>(stored);
	const [response, setResponse] = useState<AllocateBalancesResponse | null>(
		null,
	);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const allocations = changedAllocations({ entities, inputs, stored });

	const handleSubmit = async () => {
		if (!customerId || !featureId || !interval) return;
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
			const { data } = await axiosInstance.post<AllocateBalancesResponse>(
				"/v1/balances.allocate",
				{
					customer_id: customerId,
					feature_id: featureId,
					interval,
					allocations,
				},
			);
			setResponse(data);
			const settled = { ...inputs };
			for (const { entity_id, amount } of allocations)
				settled[entity_id] = amount > 0 ? String(amount) : "";
			setStored(settled);
			setInputs(settled);
			toast.success(
				`Allocated ${featureName} to ${allocations.length} ${allocations.length === 1 ? "entity" : "entities"}`,
			);
			await queryClient.invalidateQueries({ queryKey: ["customer"] });
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to allocate balances"));
		} finally {
			setIsSubmitting(false);
		}
	};

	const formattedJson = response ? JSON.stringify(response, null, 2) : "";

	return (
		<LayoutGroup>
			<div className="flex h-full flex-col overflow-hidden">
				<SheetHeader
					title="Allocate to entities"
					description={`Hold part of the shared ${featureName} credits that reset every ${interval ?? "cycle"} for each entity. Leave a row empty to release its share.`}
				/>

				<SheetSection withSeparator>
					<div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
						{entities.length === 0 && (
							<p className="text-xs text-tertiary-foreground">
								This customer has no entities.
							</p>
						)}
						{entities.map((entity: Entity) => {
							const entityId = entity.id as string;
							return (
								<div key={entityId} className="flex items-center gap-3">
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
										disabled={isSubmitting}
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

				{response && (
					<SheetSection withSeparator>
						<div className="grid grid-cols-4 gap-2 text-xs">
							{(
								[
									["Granted", response.shared.granted],
									["Remaining", response.shared.remaining],
									["Allocated", response.shared.allocated],
									["Unallocated", response.shared.unallocated],
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
					) : (
						<p className="text-xs text-tertiary-foreground">
							{allocations.length > 0
								? `One POST /balances.allocate with ${allocations.length} ${allocations.length === 1 ? "entity" : "entities"} in its allocations array. Entities not changed keep their share.`
								: "Change an amount to allocate. Entities you don't change keep their share."}
						</p>
					)}
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
						disabled={allocations.length === 0}
						metaShortcut="enter"
					>
						Allocate
					</ShortcutButton>
				</SheetFooter>
			</div>
		</LayoutGroup>
	);
}
