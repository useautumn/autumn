import { type FreeTrialDuration, getTrialLengthInDays } from "@autumn/shared";
import {
	ArrowCounterClockwiseIcon,
	CalendarBlankIcon,
	CheckIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import { FAST_TRANSITION } from "../constants/animationConstants";
import {
	formatTrialDuration,
	TRIAL_DURATION_OPTIONS,
} from "../constants/trialConstants";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";
import { getTrialRingClass } from "../utils/ringClassUtils";
import { StatusBadge } from "./StatusBadge";

interface TrialEditorRowProps {
	form: UseUpdateSubscriptionForm | UseAttachForm;
	isCurrentlyTrialing?: boolean;
	initialTrialLength?: number | null;
	initialTrialFormatted?: string | null;
	removeTrial?: boolean;
	onEndTrial?: () => void;
	onCollapse: () => void;
	onRevert?: () => void;
}

export function TrialEditorRow({
	form,
	isCurrentlyTrialing = false,
	initialTrialLength = null,
	initialTrialFormatted = null,
	removeTrial = false,
	onEndTrial,
	onCollapse,
	onRevert,
}: TrialEditorRowProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [isAddingNewTrial, setIsAddingNewTrial] = useState(
		!isCurrentlyTrialing,
	);
	const containerRef = useRef<HTMLDivElement>(null);

	const trialLength = useStore(form.store, (state) => state.values.trialLength);
	const trialDuration = useStore(
		form.store,
		(state) => state.values.trialDuration,
	);

	const hasTrialValue = trialLength !== null && trialLength > 0;
	const formattedDuration = hasTrialValue
		? formatTrialDuration({ length: trialLength, duration: trialDuration })
		: null;

	const newTrialLengthInDays = hasTrialValue
		? getTrialLengthInDays({ trialLength, trialDuration })
		: null;

	const isTrialModified =
		isCurrentlyTrialing &&
		hasTrialValue &&
		initialTrialLength !== null &&
		newTrialLengthInDays !== initialTrialLength;

	const ringClass = getTrialRingClass({
		removeTrial,
		isTrialModified,
		hasTrialValue,
		isCurrentlyTrialing,
	});

	const handleBlur = () => {
		// Use setTimeout to wait for focus to fully settle after portal interactions
		setTimeout(() => {
			const activeElement = document.activeElement;
			const isStillInContainer =
				containerRef.current?.contains(activeElement) ?? false;

			// Check if any Radix select portal is open
			const hasOpenSelect = document.querySelector(
				"[data-radix-popper-content-wrapper]",
			);

			if (!isStillInContainer && !hasOpenSelect) {
				if (hasTrialValue) {
					setIsEditing(false);
					setIsAddingNewTrial(false);
				} else if (!isCurrentlyTrialing) {
					onCollapse();
					setIsEditing(false);
					setIsAddingNewTrial(true);
				}
			}
		}, 0);
	};

	if (removeTrial && onRevert) {
		return (
			<div className="flex items-center gap-2">
				<div
					className={cn(
						"flex items-center justify-between flex-1 h-10 px-3 rounded-xl input-base",
						ringClass,
					)}
				>
					<div className="flex items-center gap-2">
						<CalendarBlankIcon
							size={14}
							weight="fill"
							className="text-red-400"
						/>
						<span className="text-sm text-t2">Free Trial</span>
					</div>
					<StatusBadge variant="removed">Removed</StatusBadge>
				</div>
				<div className="flex items-center h-10 px-3 rounded-xl input-base gap-2">
					<Tooltip>
						<TooltipTrigger asChild>
							<IconButton
								icon={<ArrowCounterClockwiseIcon size={14} />}
								variant="skeleton"
								size="sm"
								className="text-t4 hover:text-t2 hover:bg-muted"
								onClick={onRevert}
							/>
						</TooltipTrigger>
						<TooltipContent>Restore trial</TooltipContent>
					</Tooltip>
				</div>
			</div>
		);
	}

	const showDisplayMode =
		!isEditing && !isAddingNewTrial && (hasTrialValue || isCurrentlyTrialing);

	if (showDisplayMode) {
		return (
			<div className="flex items-center gap-2">
				<div
					className={cn(
						"flex items-center justify-between flex-1 h-10 px-3 rounded-xl input-base",
						ringClass,
					)}
				>
					<div className="flex items-center gap-2">
						<CalendarBlankIcon
							size={14}
							weight="fill"
							className="text-blue-400"
						/>
						<span className="text-sm text-t2">Free Trial</span>
					</div>
					{isTrialModified && initialTrialFormatted ? (
						<span className="text-xs flex items-center gap-1">
							<span className="text-red-500">{initialTrialFormatted} left</span>
							<span className="text-t3">→</span>
							<span className="text-green-500">{formattedDuration} left</span>
						</span>
					) : formattedDuration && !isCurrentlyTrialing ? (
						<span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-md">
							{formattedDuration}
						</span>
					) : initialTrialFormatted ? (
						<span className="text-xs text-t3">
							{initialTrialFormatted} left
						</span>
					) : null}
				</div>
				<div className="flex items-center h-10 px-3 rounded-xl input-base gap-2 overflow-hidden">
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.div
							key="display"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={FAST_TRANSITION}
							className="flex items-center gap-2"
						>
							<IconButton
								icon={<PencilSimpleIcon size={14} />}
								variant="skeleton"
								size="sm"
								className="text-t4 hover:text-t2 hover:bg-muted"
								onClick={() => {
									setIsEditing(true);
									setIsAddingNewTrial(false);
								}}
							/>
						</motion.div>
					</AnimatePresence>
				</div>
			</div>
		);
	}

	const handleClearTrial = () => {
		// Just collapse - preserve the value so it can be restored
		onCollapse();
		setIsEditing(false);
		setIsAddingNewTrial(true);

		// Only mark for removal if they're currently trialing (ending an active trial)
		if (isCurrentlyTrialing && onEndTrial) {
			onEndTrial();
		}
	};

	const isNewTrial = !isCurrentlyTrialing;
	const editModeRingClass = isNewTrial
		? "ring-1 ring-inset ring-green-500/50"
		: "ring-1 ring-inset ring-amber-500/50";

	return (
		<div
			ref={containerRef}
			className="flex items-center gap-2"
			onBlur={handleBlur}
		>
			<div
				className={cn(
					"flex items-center flex-1 h-10 px-3 rounded-xl input-base",
					editModeRingClass,
				)}
			>
				<div className="flex items-center gap-2">
					<CalendarBlankIcon
						size={14}
						weight="fill"
						className="text-blue-400"
					/>
					<span className="text-sm text-t2">Free Trial</span>
				</div>
			</div>
			<div className="flex items-center h-10 px-3 rounded-xl input-base gap-2 overflow-hidden">
				<AnimatePresence mode="popLayout" initial={false}>
					<motion.div
						key="edit"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={FAST_TRANSITION}
						className="flex items-center gap-2"
					>
						<form.AppField name="trialLength">
							{(field) => (
								<field.NumberField
									label=""
									placeholder="7"
									min={1}
									className="w-16"
									inputClassName="placeholder:opacity-50"
									hideFieldInfo
								/>
							)}
						</form.AppField>
						<form.AppField name="trialDuration">
							{(field) => (
								<field.SelectField
									placeholder="7"
									label=""
									options={
										TRIAL_DURATION_OPTIONS as unknown as {
											label: string;
											value: FreeTrialDuration;
										}[]
									}
									className="w-24"
									hideFieldInfo
								/>
							)}
						</form.AppField>
						<IconButton
							icon={<CheckIcon size={14} />}
							variant="skeleton"
							size="sm"
							className="text-green-600 dark:text-green-500 hover:text-green-700! dark:hover:text-green-400! hover:bg-black/5 dark:hover:bg-white/10"
							onClick={() => {
								if (hasTrialValue) {
									setIsEditing(false);
									setIsAddingNewTrial(false);
								} else {
									handleClearTrial();
								}
							}}
						/>
						<IconButton
							icon={<TrashIcon size={14} />}
							variant="skeleton"
							size="sm"
							className="text-t4 hover:text-red-400!"
							onClick={handleClearTrial}
						/>
					</motion.div>
				</AnimatePresence>
			</div>
		</div>
	);
}
