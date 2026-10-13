import { Button, InlineAction } from "@autumn/ui";
import { ArrowCounterClockwiseIcon, PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useCreditSchemaList } from "../hooks/useCreditSchemaList";
import { useFeatureOverride } from "../hooks/useFeatureOverride";
import { createSchemaItem } from "../utils/creditSchemaUtils";
import {
	addableFeatures,
	rateCardRows,
	rateCardSubtitle,
} from "../utils/rateCardRows";
import { CreditRateCardRow } from "./CreditRateCardRow";
import { RateCardRow } from "./rate-card/RateCardRow";
import { RateCardTable } from "./rate-card/RateCardTable";

/** A plan item's rate card: the credit system's rates with this plan's changes on top, edited live. */
export function CreditOverrideRateCard() {
	const { creditSystem, override, schema, setSchema, clear } =
		useFeatureOverride();
	const list = useCreditSchemaList({ schema, onChange: setSchema });
	// The picker row stays out of the override until a feature is chosen.
	const [picking, setPicking] = useState(false);
	const rows = rateCardRows({
		override: override?.schema ?? [],
		catalog: creditSystem?.config?.schema ?? [],
	});
	const creditSystemName = creditSystem?.name ?? "the credit system";
	const addable = addableFeatures({
		features: list.allSchemaCandidateFeatures,
		rows,
	});

	return (
		<RateCardTable
			subtitle={rateCardSubtitle({ creditSystemName, rows })}
			action={
				rows.some((row) => row.state !== "inherited") && (
					<InlineAction className="px-1.5" onClick={clear}>
						Reset all
					</InlineAction>
				)
			}
			footer={
				<Button
					variant="dotted"
					size="sm"
					className="w-full text-tertiary-foreground"
					disabled={picking || addable.length === 0}
					onClick={() => setPicking(true)}
				>
					<PlusIcon size={12} />
					Add a feature {creditSystemName} does not cover
				</Button>
			}
		>
			{rows.map((row) => {
				const index = schema.findIndex(
					(item) => item.metered_feature_id === row.featureId,
				);
				const key = list.schemaKeys[index] ?? row.featureId;
				if (index >= 0 && list.expandedKey === key)
					return (
						<li key={key} className="p-1">
							<CreditRateCardRow
								item={schema[index]}
								availableFeatures={list.availableFeaturesFor(schema[index])}
								allFeatures={list.allSchemaCandidateFeatures}
								onChange={(item) => list.setSchemaItem({ index, item })}
								onRemove={() => list.removeSchemaItem(index)}
								isExpanded
								onToggle={() => list.toggleExpandedKey(key)}
								showRateCardControls
							/>
						</li>
					);
				const restorable = row.state === "changed" || row.state === "excluded";
				return (
					<RateCardRow
						key={key}
						row={row}
						features={list.allSchemaCandidateFeatures}
						onClick={index >= 0 ? () => list.toggleExpandedKey(key) : undefined}
						action={
							restorable && (
								<InlineAction
									className="px-1.5"
									icon={
										row.state === "excluded" && (
											<ArrowCounterClockwiseIcon size={13} />
										)
									}
									onClick={() =>
										setSchema([
											...schema.filter(
												(item) => item.metered_feature_id !== row.featureId,
											),
											row.catalogRate,
										])
									}
								>
									{row.state === "excluded" ? "Restore" : "Reset"}
								</InlineAction>
							)
						}
					/>
				);
			})}
			{picking && (
				<li className="p-1">
					<CreditRateCardRow
						item={createSchemaItem()}
						availableFeatures={addable}
						allFeatures={list.allSchemaCandidateFeatures}
						onChange={(item) => {
							setPicking(false);
							list.addSchemaItem(item);
						}}
						onRemove={() => setPicking(false)}
						isExpanded
						onToggle={() => setPicking(false)}
						showRateCardControls
					/>
				</li>
			)}
		</RateCardTable>
	);
}
