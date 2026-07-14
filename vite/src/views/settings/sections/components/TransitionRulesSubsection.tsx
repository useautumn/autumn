import {
	type Feature,
	featureUtils,
	isBooleanFeature,
	type TransitionRuleCarryOverUsages,
} from "@autumn/shared";
import {
	Button,
	FormLabel,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { XIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { FeatureSearchDropdown } from "@/components/v2/dropdowns/FeatureSearchDropdown";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	type TransitionRulesResponse,
	useTransitionRulesQuery,
} from "@/hooks/queries/useTransitionRulesQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";

type CarryOverMode = "default" | "enabled" | "disabled";

const modeFromRule = (
	rule: TransitionRuleCarryOverUsages | null | undefined,
): CarryOverMode => {
	if (!rule) return "default";
	return rule.enabled ? "enabled" : "disabled";
};

const MODE_DESCRIPTIONS: Record<CarryOverMode, string> = {
	default:
		"Autumn defaults apply: attach only carries usage when requested per call; Stripe back-sync carries all usage.",
	enabled:
		"Usage is carried onto the new plan whenever a customer changes plans (attach and Stripe back-sync).",
	disabled:
		"Consumable usage resets on plan changes. Non-consumable features always carry over.",
};

export const TransitionRulesSubsection = () => {
	const { features } = useFeaturesQuery();
	const { transitionRules, isLoading } = useTransitionRulesQuery();
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const env = useEnv();
	const queryKey = ["transition-rules", env];

	const rule = transitionRules?.carry_over_usages ?? null;
	const mode = modeFromRule(rule);
	const featureIds = rule?.enabled ? (rule.feature_ids ?? null) : null;

	const consumableFeatures = useMemo(
		() =>
			(features ?? []).filter(
				(feature: Feature) =>
					!isBooleanFeature({ feature }) && !featureUtils.isAllocated(feature),
			),
		[features],
	);

	const selectableFeatures = useMemo(
		() =>
			consumableFeatures.filter((f: Feature) => !featureIds?.includes(f.id)),
		[consumableFeatures, featureIds],
	);

	const featureById = useMemo(
		() => new Map(consumableFeatures.map((f: Feature) => [f.id, f])),
		[consumableFeatures],
	);

	const { mutateAsync, isPending } = useMutation({
		mutationFn: async (
			carryOverUsages: TransitionRuleCarryOverUsages | null,
		) => {
			const { data } = await axiosInstance.patch(
				"/organization/transition_rules",
				{ carry_over_usages: carryOverUsages },
			);
			return data as TransitionRulesResponse;
		},
		onSuccess: (data) => {
			queryClient.setQueryData<TransitionRulesResponse>(queryKey, data);
		},
		onError: () => {
			toast.error("Failed to update transition rules");
			queryClient.invalidateQueries({ queryKey });
		},
	});

	const save = async (next: TransitionRuleCarryOverUsages | null) => {
		try {
			await mutateAsync(next);
			toast.success("Transition rules updated");
		} catch {
			// onError handles toast + invalidate
		}
	};

	const handleModeChange = (nextMode: CarryOverMode) => {
		if (nextMode === mode) return;
		if (nextMode === "default") return void save(null);
		if (nextMode === "disabled") return void save({ enabled: false });
		return void save({ enabled: true });
	};

	const handleAddFeature = (featureId: string) => {
		void save({
			enabled: true,
			feature_ids: [...(featureIds ?? []), featureId],
		});
	};

	const handleRemoveFeature = (featureId: string) => {
		const next = (featureIds ?? []).filter((id) => id !== featureId);
		void save(
			next.length > 0
				? { enabled: true, feature_ids: next }
				: { enabled: true },
		);
	};

	if (isLoading) return null;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5 max-w-md">
				<FormLabel>Carry over usage on plan changes</FormLabel>
				<Select
					value={mode}
					onValueChange={(value) => handleModeChange(value as CarryOverMode)}
					disabled={isPending}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="default">Autumn defaults</SelectItem>
						<SelectItem value="enabled">Carry over usage</SelectItem>
						<SelectItem value="disabled">Don't carry over usage</SelectItem>
					</SelectContent>
				</Select>
				<p className="text-xs text-tertiary-foreground">
					{MODE_DESCRIPTIONS[mode]}
				</p>
			</div>

			{mode === "enabled" && (
				<div className="flex flex-col gap-1.5 max-w-md">
					<FormLabel>Features</FormLabel>
					{featureIds && featureIds.length > 0 ? (
						<div className="flex flex-wrap gap-1.5">
							{featureIds.map((featureId) => {
								const feature = featureById.get(featureId);
								return (
									<span
										key={featureId}
										className="flex items-center gap-1.5 rounded-md border bg-interactive-secondary px-2 py-1 text-xs"
									>
										{feature && getFeatureIcon({ feature, size: 12 })}
										{feature?.name ?? featureId}
										<Button
											variant="ghost"
											size="mini"
											className="size-4 p-0 text-tertiary-foreground"
											onClick={() => handleRemoveFeature(featureId)}
											disabled={isPending}
										>
											<XIcon className="size-3" />
										</Button>
									</span>
								);
							})}
						</div>
					) : (
						<p className="text-xs text-tertiary-foreground">
							All consumable features are carried over. Add features to limit
							carry-over to specific ones.
						</p>
					)}
					<FeatureSearchDropdown
						features={selectableFeatures}
						value={null}
						onSelect={handleAddFeature}
						placeholder="Add a feature"
					/>
				</div>
			)}

			<p className="text-xs text-tertiary-foreground">
				Non-consumable features (e.g. seats, contacts) always carry their usage
				over. These rules also apply when plan changes are synced back from
				Stripe.
			</p>
		</div>
	);
};
