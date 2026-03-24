import {
	type Feature,
	FeatureGrantDuration,
	FeatureType,
} from "@autumn/shared";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SearchableSelect } from "@/components/v2/selects/SearchableSelect";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import type {
	FrontendReward,
	FrontendRewardEntitlement,
} from "../../types/frontendReward";

interface FeatureGrantRewardConfigProps {
	reward: FrontendReward;
	setReward: (reward: FrontendReward) => void;
}

export function FeatureGrantRewardConfig({
	reward,
	setReward,
}: FeatureGrantRewardConfigProps) {
	const { features } = useFeaturesQuery();

	// Filter to metered, non-boolean features only
	const meteredFeatures = features.filter(
		(f) => f.type === FeatureType.Metered,
	);

	const entitlements = reward.featureGrantEntitlements;

	const updateEntitlement = ({
		index,
		updates,
	}: {
		index: number;
		updates: Partial<FrontendRewardEntitlement>;
	}) => {
		const updated = [...entitlements];
		updated[index] = { ...updated[index], ...updates };
		setReward({ ...reward, featureGrantEntitlements: updated });
	};

	const addEntitlement = () => {
		// Infer expiry from the first entitlement that has one
		const existingExpiry = entitlements.find((e) => e.expiry)?.expiry;
		setReward({
			...reward,
			featureGrantEntitlements: [
				...entitlements,
				{
					feature_id: "",
					allowance: 0,
					expiry: existingExpiry ? { ...existingExpiry } : undefined,
				},
			],
		});
	};

	const removeEntitlement = ({ index }: { index: number }) => {
		setReward({
			...reward,
			featureGrantEntitlements: entitlements.filter((_, i) => i !== index),
		});
	};

	const updatePromoCode = ({
		index,
		code,
	}: {
		index: number;
		code: string;
	}) => {
		const updated = [...(reward.promo_codes || [])];
		updated[index] = { ...updated[index], code };
		setReward({ ...reward, promo_codes: updated });
	};

	const updateMaxRedemptions = ({
		index,
		value,
	}: {
		index: number;
		value: number | undefined;
	}) => {
		const updated = [...(reward.promo_codes || [])];
		updated[index] = { ...updated[index], max_redemptions: value };
		setReward({ ...reward, promo_codes: updated });
	};

	const addPromoCode = () => {
		// Infer max_redemptions from first promo code
		const existingMax = reward.promo_codes?.find(
			(pc) => pc.max_redemptions,
		)?.max_redemptions;
		setReward({
			...reward,
			promo_codes: [
				...(reward.promo_codes || []),
				{ code: "", max_redemptions: existingMax },
			],
		});
	};

	const removePromoCode = ({ index }: { index: number }) => {
		setReward({
			...reward,
			promo_codes: (reward.promo_codes || []).filter((_, i) => i !== index),
		});
	};

	// Exclude features already selected in other entitlements
	const getAvailableFeatures = ({ currentIndex }: { currentIndex: number }) => {
		const selectedIds = entitlements
			.filter((_, i) => i !== currentIndex)
			.map((e) => e.feature_id);
		return meteredFeatures.filter((f) => !selectedIds.includes(f.id));
	};

	return (
		<>
			{/* Promo Codes Section */}
			<SheetSection title="Promo Codes">
				<div className="space-y-3">
					{(reward.promo_codes || []).map((promoCode, index) => (
						<div key={index} className="flex items-end gap-2">
							<div className="flex-1">
								{index === 0 && <FormLabel>Code</FormLabel>}
								<Input
									value={promoCode.code}
									onChange={(e) =>
										updatePromoCode({
											index,
											code: e.target.value
												.toUpperCase()
												.replace(/[^A-Z0-9]/g, ""),
										})
									}
									placeholder="PROMO2024"
								/>
							</div>
							<div className="w-32">
								{index === 0 && <FormLabel>Max Uses</FormLabel>}
								<Input
									type="number"
									value={promoCode.max_redemptions ?? ""}
									onChange={(e) =>
										updateMaxRedemptions({
											index,
											value: e.target.value
												? Number(e.target.value)
												: undefined,
										})
									}
									placeholder="Unlimited"
								/>
							</div>
							{(reward.promo_codes || []).length > 1 && (
								<button
									type="button"
									onClick={() => removePromoCode({ index })}
									className="p-2 text-t4 hover:text-t1 transition-colors"
								>
									<TrashIcon size={14} />
								</button>
							)}
						</div>
					))}
					<Button variant="secondary" size="sm" onClick={addPromoCode}>
						<PlusIcon size={12} className="mr-1" />
						Add Code
					</Button>
				</div>
			</SheetSection>

			{/* Entitlements Section */}
			<SheetSection title="Feature Grants">
				<div className="space-y-4">
					{entitlements.map((ent, index) => (
						<div
							key={index}
							className="relative space-y-3 rounded-lg border border-border p-3"
						>
							{entitlements.length > 1 && (
								<button
									type="button"
									onClick={() => removeEntitlement({ index })}
									className="absolute top-2 right-2 p-1 text-t4 hover:text-t1 transition-colors cursor-pointer"
								>
									<TrashIcon size={12} />
								</button>
							)}

							{/* Feature selector */}
							<div>
								<FormLabel>Feature</FormLabel>
								<SearchableSelect<Feature>
									value={ent.feature_id || null}
									onValueChange={(value) =>
										updateEntitlement({
											index,
											updates: { feature_id: value },
										})
									}
									options={getAvailableFeatures({
										currentIndex: index,
									})}
									getOptionValue={(f) => f.id}
									getOptionLabel={(f) => f.name}
									placeholder="Select a metered feature..."
									searchable
									searchPlaceholder="Search features..."
									emptyText="No metered features found"
									triggerClassName="cursor-pointer"
								/>
							</div>

							{/* Allowance */}
							<div>
								<FormLabel>Balance Grant</FormLabel>
								<Input
									type="number"
									value={ent.allowance || ""}
									onChange={(e) =>
										updateEntitlement({
											index,
											updates: {
												allowance: Number(e.target.value),
											},
										})
									}
									placeholder="0"
								/>
							</div>

							{/* Expiry */}
							<div>
								<FormLabel>Expiry</FormLabel>
								{ent.expiry ? (
									<div className="flex items-center gap-2">
										<Input
											type="number"
											value={ent.expiry.length || ""}
											onChange={(e) =>
												updateEntitlement({
													index,
													updates: {
														expiry: {
															duration:
																ent.expiry?.duration ??
																FeatureGrantDuration.Month,
															length: Number(e.target.value),
														},
													},
												})
											}
											placeholder="30"
											className="w-20"
										/>
										<Select
											value={ent.expiry.duration}
											onValueChange={(value) =>
												updateEntitlement({
													index,
													updates: {
														expiry: {
															duration: value as FeatureGrantDuration,
															length: ent.expiry?.length ?? 1,
														},
													},
												})
											}
										>
											<SelectTrigger className="flex-1">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value={FeatureGrantDuration.Day}>
													Day(s)
												</SelectItem>
												<SelectItem value={FeatureGrantDuration.Week}>
													Week(s)
												</SelectItem>
												<SelectItem value={FeatureGrantDuration.Month}>
													Month(s)
												</SelectItem>
												<SelectItem value={FeatureGrantDuration.Year}>
													Year(s)
												</SelectItem>
											</SelectContent>
										</Select>
										<button
											type="button"
											onClick={() =>
												updateEntitlement({
													index,
													updates: { expiry: undefined },
												})
											}
											className="text-xs text-t4 hover:text-t1 transition-colors whitespace-nowrap"
										>
											Clear
										</button>
									</div>
								) : (
									<button
										type="button"
										onClick={() =>
											updateEntitlement({
												index,
												updates: {
													expiry: {
														duration: FeatureGrantDuration.Month,
														length: 1,
													},
												},
											})
										}
									className="text-xs text-t4 hover:text-t1 transition-colors cursor-pointer"
								>
									No expiry (permanent). Click to set one.
									</button>
								)}
							</div>
						</div>
					))}

					<Button variant="secondary" size="sm" onClick={addEntitlement}>
						<PlusIcon size={12} className="mr-1" />
						Add Entitlement
					</Button>
				</div>
			</SheetSection>
		</>
	);
}
