import { type FreeTrialDuration, getTrialLengthInDays } from "@autumn/shared";
import {
	ArrowCounterClockwiseIcon,
	CalendarBlankIcon,
	CheckIcon,
	PencilSimpleIcon,
	TimerIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { useState } from "react";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import {
	formatTrialDuration,
	TRIAL_DURATION_OPTIONS,
} from "../constants/trialConstants";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";
import { getTrialRingClass } from "../utils/ringClassUtils";
import { StatusBadge } from "./StatusBadge";

interface TrialEditorRowProps {
	form: UseUpdateSubscriptionForm;
	isCurrentlyTrialing: boolean;
	initialTrialLength: number | null;
	initialTrialFormatted: string | null;
	removeTrial: boolean;
	onEndTrial: () => void;
	onCollapse: () => void;
	onRevert: () => void;
}

export function TrialEditorRow({
	form,
	isCurrentlyTrialing,
	initialTrialLength,
	initialTrialFormatted,
	removeTrial,
	onEndTrial,
	onCollapse,
	onRevert,
}: TrialEditorRowProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [isAddingNewTrial, setIsAddingNewTrial] = useState(
		!isCurrentlyTrialing,
	);

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

	if (removeTrial) {
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

	if (
		!isEditing &&
		!isAddingNewTrial &&
		(hasTrialValue || isCurrentlyTrialing)
	) {
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
							className={cn(
								isTrialModified ? "text-amber-400" : "text-blue-400",
							)}
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
				<div className="flex items-center h-10 px-3 rounded-xl input-base gap-2">
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
				</div>
			</div>
		);
	}

	const handleClearTrial = () => {
		if (!hasTrialValue && !isCurrentlyTrialing) {
			onCollapse();
			setIsEditing(false);
			setIsAddingNewTrial(true);
			return;
		}

		form.setFieldValue("trialLength", null);
		if (isCurrentlyTrialing) {
			onEndTrial();
		}
		setIsEditing(false);
		setIsAddingNewTrial(true);
	};

	return (
		<div className="flex items-center gap-2">
			<div
				className={cn(
					"flex items-center flex-1 h-10 px-3 rounded-xl input-base",
					"ring-1 ring-inset ring-amber-500/50",
				)}
			>
				<div className="flex items-center gap-2">
					<TimerIcon size={14} className="text-amber-400" />
					<span className="text-sm text-t2">Free Trial</span>
				</div>
			</div>
			<div className="flex items-center h-10 px-3 rounded-xl input-base gap-2">
				<form.AppField name="trialLength">
					{(field) => {
						const showError = field.state.meta.isTouched && !hasTrialValue;
						return (
							<field.NumberField
								label=""
								placeholder="7"
								min={1}
								className={cn("w-16", showError && "[&_input]:border-red-500!")}
								hideFieldInfo
							/>
						);
					}}
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
					icon={<TrashIcon size={14} />}
					variant="skeleton"
					size="sm"
					className="text-t4 hover:text-red-400"
					onClick={handleClearTrial}
				/>
				<IconButton
					icon={<CheckIcon size={14} />}
					variant="skeleton"
					size="sm"
					className="text-t4 hover:text-t2 hover:bg-muted"
					onClick={() => {
						if (!hasTrialValue) {
							form.setFieldMeta("trialLength", (prev) => ({
								...prev,
								isTouched: true,
							}));
							return;
						}
						setIsEditing(false);
						setIsAddingNewTrial(false);
					}}
				/>
			</div>
		</div>
	);
}
