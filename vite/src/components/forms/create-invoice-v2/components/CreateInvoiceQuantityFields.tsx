import {
	findFeatureById,
	getFeatureName,
	type ProductItem,
} from "@autumn/shared";
import type { ReactNode } from "react";
import { PlanPrepaidQuantityFields } from "@/components/forms/shared";
import { PrepaidQuantityControl } from "@/components/forms/shared/plan-items/PrepaidQuantityControl";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { prepaidTierStops } from "@/utils/billing/prepaidQuantityUtils";
import { PlanFeatureIcon } from "@/views/products/plan/components/plan-card/PlanFeatureIcon";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import { INVOICE_USAGE_MODELS } from "../utils/applyInvoicePlanEditorItems";
import { dualPricedRowCopy } from "../utils/dualPricedRowCopy";
import {
	type InvoiceQuantityRow,
	invoiceQuantityRows,
	isPricedBothWays,
} from "../utils/invoiceQuantityRows";

export function CreateInvoiceQuantityFields({
	items,
	quantities,
	overageQuantities = {},
	planIndex,
	licenseIndex,
	currency,
}: {
	items?: ProductItem[] | null;
	quantities: Record<string, number | undefined>;
	overageQuantities?: Record<string, number | undefined>;
	planIndex: number;
	licenseIndex?: number;
	currency?: string;
}) {
	const { form } = useCreateInvoiceFormContext();

	const getFieldName = ({ featureId }: { featureId: string }) =>
		licenseIndex === undefined
			? (`plans[${planIndex}].featureQuantities.${featureId}` as const)
			: (`plans[${planIndex}].licenses[${licenseIndex}].featureQuantities.${featureId}` as const);

	const renderQuantityField = ({
		name,
		step = 1,
		stops = [],
	}: {
		name:
			| ReturnType<typeof getFieldName>
			| `plans[${number}].overageQuantities.${string}`;
		step?: number;
		stops?: number[];
	}) => (
		<form.AppField name={name}>
			{(field) => (
				<field.QuantityField
					fullWidth
					hideFieldInfo
					label=""
					min={0}
					step={step}
					stops={stops}
				/>
			)}
		</form.AppField>
	);

	const dualRows =
		licenseIndex === undefined
			? invoiceQuantityRows({ items }).filter(isPricedBothWays)
			: [];
	const dualFeatureIds = new Set(dualRows.map(({ featureId }) => featureId));
	const singleItems = (items ?? []).filter(
		(item) => !item.feature_id || !dualFeatureIds.has(item.feature_id),
	);
	const hasSingleRows = singleItems.some(
		(item) =>
			item.feature_id &&
			item.usage_model &&
			INVOICE_USAGE_MODELS.includes(item.usage_model),
	);
	if (!hasSingleRows && dualRows.length === 0) return null;

	return (
		<div className="space-y-1">
			<PlanPrepaidQuantityFields
				items={singleItems}
				quantities={quantities}
				currency={currency}
				usageModels={INVOICE_USAGE_MODELS}
				renderField={({ featureId, step, stops }) =>
					renderQuantityField({
						name: getFieldName({ featureId }),
						step,
						stops,
					})
				}
			/>
			{dualRows.length > 0 && (
				<div className="ml-4 space-y-1.5 border-l border-border/40 pl-3">
					{dualRows.map((row) => (
						<DualPricedQuantityRows
							key={row.featureId}
							row={row}
							currency={currency}
							prepaidQuantity={quantities[row.featureId]}
							usageQuantity={overageQuantities[row.featureId]}
							prepaidField={renderQuantityField({
								name: getFieldName({ featureId: row.featureId }),
								step: row.prepaid?.billing_units ?? 1,
								stops: row.prepaid
									? prepaidTierStops({ item: row.prepaid })
									: [],
							})}
							usageField={renderQuantityField({
								name: `plans[${planIndex}].overageQuantities.${row.featureId}`,
							})}
						/>
					))}
				</div>
			)}
		</div>
	);
}

/** One feature billed as a prepaid pack plus usage beyond it: a shared name over two quantity rows. */
function DualPricedQuantityRows({
	row,
	currency,
	prepaidQuantity,
	usageQuantity,
	prepaidField,
	usageField,
}: {
	row: InvoiceQuantityRow;
	currency?: string;
	prepaidQuantity: number | undefined;
	usageQuantity: number | undefined;
	prepaidField: ReactNode;
	usageField: ReactNode;
}) {
	const { features } = useFeaturesQuery();
	const { org } = useOrg();
	const { prepaid, usage } = row;
	if (!prepaid || !usage) return null;

	const feature = findFeatureById({ features, featureId: row.featureId });
	const copy = dualPricedRowCopy({
		prepaid,
		usage,
		prepaidQuantity,
		feature,
		currency: currency || org?.default_currency || "USD",
	});

	return (
		<div>
			<p className="truncate text-body">
				{getFeatureName({ feature, plural: true, capitalize: true }) ||
					row.featureId}
			</p>
			<div className="ml-1 space-y-0.5 border-l border-dashed border-border pl-3">
				<DualPricedQuantityRow
					text={copy.prepaid}
					item={prepaid}
					currency={currency}
					quantity={prepaidQuantity}
					billingUnits={prepaid.billing_units}
					featureId={row.featureId}
				>
					{prepaidField}
				</DualPricedQuantityRow>
				<DualPricedQuantityRow
					text={copy.usage}
					item={usage}
					currency={currency}
					quantity={usageQuantity}
					featureId={row.featureId}
				>
					{usageField}
				</DualPricedQuantityRow>
			</div>
		</div>
	);
}

function DualPricedQuantityRow({
	text,
	item,
	currency,
	quantity,
	billingUnits,
	featureId,
	children,
}: {
	text: string | null;
	item: ProductItem;
	currency?: string;
	quantity: number | undefined;
	billingUnits?: number | null;
	featureId: string;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center gap-2">
			<div className="shrink-0">
				<PlanFeatureIcon item={item} position="right" />
			</div>
			<div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
				{text ? (
					<p className="truncate text-body-secondary">{text}</p>
				) : (
					<PlanItemLabel
						compact
						currency={currency}
						item={item}
						showFeatureIcons={false}
					/>
				)}
			</div>
			<PrepaidQuantityControl
				billingUnits={billingUnits}
				featureId={featureId}
				quantity={quantity}
			>
				{children}
			</PrepaidQuantityControl>
		</div>
	);
}
