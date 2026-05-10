import type { BillingInterval, UpdatePlanOp } from "@autumn/shared";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";
import { FilterGroup } from "../filters/FilterGroup";
import {
	groupsToPlanFilter,
	planFilterToGroups,
} from "../filters/filterRowTypes";
import { AddButton } from "../shared/AddButton";
import { INTERVAL_OPTIONS } from "../shared/constants";
import { AddItemRows } from "./AddItemRows";
import { OperationRow } from "./OperationRow";
import { RemoveItemRows } from "./RemoveItemRows";

function useOperationContext({
	planFilter,
}: {
	planFilter: UpdatePlanOp["plan_filter"];
}) {
	const { products } = useProductsQuery();
	const { features } = useFeaturesQuery();

	const targetPlanId =
		typeof planFilter.plan_id === "string" && planFilter.plan_id
			? planFilter.plan_id
			: null;

	const matchingProducts = targetPlanId
		? products.filter((p) => p.id === targetPlanId)
		: [];

	const versionOptions = matchingProducts
		.map((p) => ({
			value: String(p.version),
			label: `v${p.version}`,
		}))
		.sort((a, b) => Number(a.value) - Number(b.value));

	const planItemFeatureIds = new Set(
		matchingProducts.flatMap((p) =>
			p.items
				.map((item) => item.feature_id)
				.filter((id): id is string => Boolean(id)),
		),
	);

	const allFeatureSuggestions = features.map((f) => {
		const iconConfig = getFeatureIconConfig(f.type, f.config?.usage_type);
		return {
			value: f.id,
			label: f.name || f.id,
			icon: <span className={iconConfig.color}>{iconConfig.icon}</span>,
		};
	});

	const planFeatureSuggestions = allFeatureSuggestions.filter((f) =>
		planItemFeatureIds.has(f.value),
	);

	return {
		versionOptions,
		allFeatureSuggestions,
		planFeatureSuggestions:
			planFeatureSuggestions.length > 0
				? planFeatureSuggestions
				: allFeatureSuggestions,
	};
}

export function UpdatePlanOpForm({
	value,
	onChange,
}: {
	value: UpdatePlanOp;
	onChange: (value: UpdatePlanOp) => void;
}) {
	const { versionOptions, allFeatureSuggestions, planFeatureSuggestions } =
		useOperationContext({ planFilter: value.plan_filter });

	const update = (patch: Partial<UpdatePlanOp>) =>
		onChange({ ...value, ...patch });

	const targetGroups = planFilterToGroups(value.plan_filter);
	const targetGroup = targetGroups[0] ?? { rules: [] };
	const customize = value.customize;

	return (
		<div className="flex flex-col">
			<FilterGroup
				group={targetGroup}
				onChange={(updated) =>
					update({ plan_filter: groupsToPlanFilter([updated]) })
				}
				onDelete={() => update({ plan_filter: {} })}
				showDelete={false}
			/>

			{value.version !== undefined && (
				<OperationRow
					connector="Set"
					fieldLabel="Version"
					value={String(value.version ?? "")}
					config={
						versionOptions.length > 0
							? {
									label: "Version",
									valueType: "enum",
									enumOptions: versionOptions,
									placeholder: "Select version...",
								}
							: {
									label: "Version",
									valueType: "number",
									placeholder: "Latest",
								}
					}
					onChange={(v) => update({ version: v ? Number(v) : undefined })}
					onRemove={() => update({ version: undefined })}
				/>
			)}

			{customize?.price !== undefined && (
				<>
					<OperationRow
						connector="Set"
						fieldLabel="Price"
						value={String(customize.price?.amount ?? "")}
						config={{
							label: "Amount",
							valueType: "number",
							placeholder: "0",
						}}
						onChange={(v) =>
							update({
								customize: {
									...customize,
									price: {
										...(customize.price ?? {
											amount: 0,
											interval: "month" as BillingInterval,
										}),
										amount: v ? Number(v) : 0,
									},
								},
							})
						}
						onRemove={() =>
							update({
								customize: {
									...customize,
									price: undefined,
								},
							})
						}
					/>
					<OperationRow
						connector=""
						fieldLabel="Interval"
						value={customize.price?.interval ?? ""}
						config={{
							label: "Interval",
							valueType: "enum",
							enumOptions: INTERVAL_OPTIONS,
						}}
						onChange={(v) =>
							update({
								customize: {
									...customize,
									price: {
										...(customize.price ?? {
											amount: 0,
											interval: "month" as BillingInterval,
										}),
										interval: v as BillingInterval,
									},
								},
							})
						}
					/>
				</>
			)}

			{(customize?.add_items ?? []).map((item, index) => (
				<AddItemRows
					key={`add-${index}`}
					label="Add"
					item={item}
					featureSuggestions={allFeatureSuggestions}
					onChange={(updated) => {
						const items = [...(customize?.add_items ?? [])];
						items[index] = updated;
						update({
							customize: { ...customize, add_items: items },
						});
					}}
					onRemove={() => {
						const items = (customize?.add_items ?? []).filter(
							(_, i) => i !== index,
						);
						update({
							customize: {
								...customize,
								add_items: items.length > 0 ? items : undefined,
							},
						});
					}}
				/>
			))}

			{(customize?.remove_items ?? []).map((item, index) => (
				<RemoveItemRows
					key={`remove-${index}`}
					item={item}
					featureSuggestions={planFeatureSuggestions}
					onChange={(updated) => {
						const items = [...(customize?.remove_items ?? [])];
						items[index] = updated;
						update({
							customize: { ...customize, remove_items: items },
						});
					}}
					onRemove={() => {
						const items = (customize?.remove_items ?? []).filter(
							(_, i) => i !== index,
						);
						update({
							customize: {
								...customize,
								remove_items: items.length > 0 ? items : undefined,
							},
						});
					}}
				/>
			))}

			<div className="flex items-center gap-2 py-1 pl-[3.625rem] flex-wrap">
				{value.version === undefined && (
					<AddButton label="Version" onClick={() => update({ version: 1 })} />
				)}
				{!customize && (
					<AddButton
						label="Customize"
						onClick={() =>
							update({
								customize: {} as UpdatePlanOp["customize"],
							})
						}
					/>
				)}
				{customize && customize.price === undefined && (
					<AddButton
						label="Base Price"
						onClick={() =>
							update({
								customize: {
									...customize,
									price: {
										amount: 0,
										interval: "month" as BillingInterval,
									},
								},
							})
						}
					/>
				)}
				{customize && (
					<AddButton
						label="Add Item"
						onClick={() =>
							update({
								customize: {
									...customize,
									add_items: [...(customize.add_items ?? []), {}],
								},
							})
						}
					/>
				)}
				{customize && (
					<AddButton
						label="Remove Item"
						onClick={() =>
							update({
								customize: {
									...customize,
									remove_items: [
										...(customize.remove_items ?? []),
										{} as Record<string, unknown>,
									],
								},
							})
						}
					/>
				)}
			</div>
		</div>
	);
}
