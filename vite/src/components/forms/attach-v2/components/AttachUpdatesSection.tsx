import { MinusCircleIcon, PlusCircleIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import {
	STAGGER_CONTAINER,
	STAGGER_ITEM,
} from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { Skeleton } from "@/components/ui/skeleton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useAttachFormContext } from "../context/AttachFormProvider";

function AttachUpdatesSkeleton() {
	return (
		<SheetSection withSeparator>
			<motion.div
				initial="hidden"
				animate="visible"
				variants={STAGGER_CONTAINER}
			>
				<motion.div variants={STAGGER_ITEM}>
					<div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
						<Skeleton className="h-4 w-4 rounded-full shrink-0" />
						<Skeleton className="h-4 w-48" />
					</div>
				</motion.div>
			</motion.div>
		</SheetSection>
	);
}

export function AttachUpdatesSection() {
	const { previewQuery, formValues, product } = useAttachFormContext();

	const hasProductSelected = !!formValues.productId;
	const { data: previewData, isPending } = previewQuery;
	const outgoing = previewData?.outgoing ?? [];

	if (!hasProductSelected) {
		return null;
	}

	if (isPending) {
		return <AttachUpdatesSkeleton />;
	}

	if (!product) {
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
			<motion.div
				initial="hidden"
				animate="visible"
				variants={STAGGER_CONTAINER}
			>
				<motion.div variants={STAGGER_ITEM}>
					<InfoBox variant="note">
						Attaching{" "}
						<PlusCircleIcon
							weight="fill"
							className="text-green-500 size-3.5 inline align-[-2px] mr-1"
						/>
						<span className="text-foreground font-medium">{product.name}</span>
						{outgoing.length > 0 && <> and removing {renderOutgoingPlans()}</>}
					</InfoBox>
				</motion.div>
			</motion.div>
		</SheetSection>
	);
}
