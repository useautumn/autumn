import {
	type CreditSchemaItem,
	findFeatureById,
	getFeatureName,
	hasCreditDimensionRules,
	isAiCreditSystem,
} from "@autumn/shared";
import { Button, FormLabel, InlineAction } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { RateCardEditor } from "../../hooks/useRateCardEditor";
import { withoutDimensions } from "../../utils/creditDimensionUtils";
import {
	addTier,
	isGraduated,
	setRateType,
	updateTier,
} from "../../utils/creditSchemaUtils";
import { CreditBillingUnits } from "../CreditBillingUnits";
import { CreditNumberInput } from "../CreditNumberInput";
import { CreditRowDimensions } from "../CreditRowDimensions";
import { CreditTierRows } from "../CreditTierRows";
import { FeatureSelectDropdown } from "../FeatureSelectDropdown";

const singleRateOf = (rate: CreditSchemaItem | undefined) => {
	if (!rate) return undefined;
	return isGraduated(rate) ? rate.tiers[0]?.credit_amount : rate.credit_amount;
};

/** Inline edit of one rate: changes stay a draft until Done. */
export function RateCardRowEditor({
	editor,
	catalogRate,
}: {
	editor: RateCardEditor;
	catalogRate?: CreditSchemaItem;
}) {
	const { edit, features, addableFeatures, setDraft } = editor;
	const [dimensionsOpen, setDimensionsOpen] = useState(false);
	if (!edit) return null;

	const { draft, featureId } = edit;
	const feature = findFeatureById({
		features,
		featureId: draft.metered_feature_id,
		errorOnNotFound: false,
	});
	const isAiChild = isAiCreditSystem(feature?.type);
	const unitName = isAiChild
		? "of AI usage"
		: getFeatureName({
				feature,
				plural: (draft.feature_amount ?? 1) !== 1,
			}) || "units";
	const isMultiTier = isGraduated(draft) && draft.tiers.length > 1;
	const showDimensions = dimensionsOpen || hasCreditDimensionRules(draft);
	const catalogSingleRate = singleRateOf(catalogRate);

	const setSingleRate = (credit_amount: number) =>
		setDraft(
			isGraduated(draft)
				? updateTier({ item: draft, index: 0, patch: { credit_amount } })
				: { ...draft, credit_amount },
		);
	const addTierToDraft = () => {
		const graduated = isGraduated(draft)
			? draft
			: setRateType({ item: draft, rateType: "graduated" });
		setDraft(isGraduated(graduated) ? addTier(graduated) : graduated);
	};

	const billingUnits = (
		<CreditBillingUnits
			className="w-full"
			value={draft.feature_amount}
			unitName={unitName}
			isAiChild={isAiChild}
			onValueChange={(feature_amount) => setDraft({ ...draft, feature_amount })}
		/>
	);

	return (
		<div className="flex flex-col gap-3 pr-3 pb-3 pl-9">
			{featureId === null && (
				<div className="flex flex-col">
					<FormLabel>Feature</FormLabel>
					<FeatureSelectDropdown
						value={draft.metered_feature_id}
						onValueChange={(metered_feature_id) =>
							setDraft({ ...draft, metered_feature_id })
						}
						availableFeatures={addableFeatures}
						allFeatures={features}
						defaultOpen
					/>
				</div>
			)}

			{isMultiTier && isGraduated(draft) ? (
				<div className="flex flex-col gap-2">
					<CreditTierRows item={draft} onChange={setDraft} />
					{billingUnits}
				</div>
			) : (
				<div className="flex gap-2">
					<div className="flex min-w-0 flex-1 flex-col">
						<FormLabel>Credits per use</FormLabel>
						<div className="relative">
							<CreditNumberInput
								ariaLabel="Credits per use"
								placeholder="eg. 1"
								className="pr-32"
								value={singleRateOf(draft)}
								onValueChange={setSingleRate}
							/>
							{catalogSingleRate !== undefined && (
								<span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-placeholder text-xs">
									Credit system: {catalogSingleRate}
								</span>
							)}
						</div>
					</div>
					<div className="flex w-36 shrink-0 flex-col">
						<FormLabel>Per</FormLabel>
						{billingUnits}
					</div>
				</div>
			)}

			{showDimensions && (
				<CreditRowDimensions
					item={draft}
					onChange={setDraft}
					onRemove={() => {
						setDimensionsOpen(false);
						setDraft(withoutDimensions(draft));
					}}
				/>
			)}

			<div className="flex items-center gap-3">
				{!isMultiTier && (
					<InlineAction icon={<PlusIcon size={10} />} onClick={addTierToDraft}>
						Add tier
					</InlineAction>
				)}
				{!showDimensions && (
					<InlineAction
						icon={<PlusIcon size={10} />}
						onClick={() => setDimensionsOpen(true)}
					>
						Add dimension
					</InlineAction>
				)}
			</div>

			<div className="flex items-center gap-1.5">
				{featureId !== null && (
					<InlineAction
						className="text-red-500 hover:text-red-600"
						onClick={() => editor.remove(featureId)}
					>
						Remove from this plan
					</InlineAction>
				)}
				<InlineAction className="ml-auto px-1.5" onClick={editor.cancel}>
					Cancel
				</InlineAction>
				<Button
					variant="secondary"
					size="sm"
					disabled={!draft.metered_feature_id}
					onClick={editor.commit}
				>
					Done
				</Button>
			</div>
		</div>
	);
}
