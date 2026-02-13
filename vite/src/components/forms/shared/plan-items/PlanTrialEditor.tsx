import { AnimatePresence, motion } from "motion/react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { TrialEditorRow } from "@/components/forms/update-subscription-v2/components/TrialEditorRow";
import {
	FAST_TRANSITION,
	STAGGER_ITEM,
} from "@/components/forms/update-subscription-v2/constants/animationConstants";
import type { UseTrialStateReturn } from "@/components/forms/update-subscription-v2/hooks/useTrialState";
import type { UseUpdateSubscriptionForm } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionForm";
import { LAYOUT_TRANSITION } from "@/components/v2/sheets/SharedSheetComponents";

interface TrialConfigSimple {
	trialEnabled: boolean;
	onTrialCollapse: () => void;
}

interface TrialConfigComplex {
	trialState: UseTrialStateReturn;
}

export type TrialConfig = TrialConfigSimple | TrialConfigComplex;

function isComplexTrialConfig(
	config: TrialConfig,
): config is TrialConfigComplex {
	return "trialState" in config;
}

export function PlanTrialEditor({
	trialConfig,
	form,
	useStagger,
}: {
	trialConfig?: TrialConfig;
	form: UseUpdateSubscriptionForm | UseAttachForm;
	useStagger?: boolean;
}) {
	if (!trialConfig) return null;

	const showTrialEditor = isComplexTrialConfig(trialConfig)
		? trialConfig.trialState.isTrialExpanded ||
			trialConfig.trialState.removeTrial
		: trialConfig.trialEnabled;

	if (!showTrialEditor) return null;

	if (isComplexTrialConfig(trialConfig)) {
		const { trialState } = trialConfig;
		return (
			<motion.div
				key="trial-editor"
				layout
				transition={{ layout: LAYOUT_TRANSITION }}
				variants={useStagger ? STAGGER_ITEM : undefined}
			>
				<TrialEditorRow
					form={form}
					isCurrentlyTrialing={trialState.isCurrentlyTrialing}
					initialTrialLength={trialState.remainingTrialDays}
					initialTrialFormatted={trialState.remainingTrialFormatted}
					removeTrial={trialState.removeTrial}
					onEndTrial={trialState.handleEndTrial}
					onCollapse={() => trialState.setIsTrialExpanded(false)}
					onRevert={trialState.handleRevertTrial}
				/>
			</motion.div>
		);
	}

	return (
		<AnimatePresence mode="popLayout">
			{trialConfig.trialEnabled && (
				<motion.div
					key="trial-editor"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1, transition: FAST_TRANSITION }}
					exit={{ opacity: 0, transition: FAST_TRANSITION }}
				>
					<TrialEditorRow
						form={form}
						onCollapse={trialConfig.onTrialCollapse}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
