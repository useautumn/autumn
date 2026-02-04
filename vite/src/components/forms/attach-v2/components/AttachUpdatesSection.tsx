import { MinusCircleIcon, PlusCircleIcon } from "@phosphor-icons/react";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useAttachFormContext } from "../context/AttachFormProvider";

export function AttachUpdatesSection() {
	const { previewQuery, formValues, product } = useAttachFormContext();

	const hasProductSelected = !!formValues.productId;
	const { data: previewData, isPending } = previewQuery;
	const outgoing = previewData?.outgoing ?? [];

	if (!hasProductSelected || isPending || outgoing.length === 0 || !product) {
		return null;
	}

	const renderOutgoingPlans = () => {
		return outgoing.map((change, index) => {
			const isLast = index === outgoing.length - 1;
			const needsComma = index > 0 && !isLast;
			const needsAnd = isLast && index > 0;

			return (
				<span key={change.plan.id}>
					{needsComma && ", "}
					{needsAnd && " and "}
					<MinusCircleIcon
						weight="fill"
						className="text-red-500 size-3.5 inline align-[-2px] mr-1"
					/>
					<span className="text-foreground font-medium">
						{change.plan.name}
					</span>
				</span>
			);
		});
	};

	return (
		<SheetSection withSeparator>
			<InfoBox variant="note">
				Attaching{" "}
				<PlusCircleIcon
					weight="fill"
					className="text-green-500 size-3.5 inline align-[-2px] mr-1"
				/>
				<span className="text-foreground font-medium">{product.name}</span> and
				removing {renderOutgoingPlans()}
			</InfoBox>
		</SheetSection>
	);
}
