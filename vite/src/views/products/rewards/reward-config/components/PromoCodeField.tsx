import { getGlobalMaxRedemption } from "@autumn/shared";
import { FormLabel, Input, TextCheckbox } from "@autumn/ui";
import type { FrontendReward } from "../../types/frontendReward";
import { FirstTimeTransactionTooltip } from "./FirstTimeTransactionTooltip";

interface PromoCodeFieldProps {
	reward: FrontendReward;
	setReward: (reward: FrontendReward) => void;
}

export function PromoCodeField({ reward, setReward }: PromoCodeFieldProps) {
	const promoCode = reward.promo_codes[0];

	const hasCode = Boolean(promoCode);

	const updatePromoCode = (
		updates: Partial<NonNullable<FrontendReward["promo_codes"]>[number]>,
	) => {
		if (!promoCode) return;
		const { max_redemptions: deprecatedMax, ...rest } = promoCode;
		setReward({
			...reward,
			promo_codes: [
				{
					...rest,
					global_max_redemption: rest.global_max_redemption ?? deprecatedMax,
					...updates,
				},
			],
		});
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-end gap-2">
				<div className="flex-1">
					<FormLabel>Promotional Code (Optional)</FormLabel>
					<Input
						placeholder="SAVE20"
						value={promoCode?.code || ""}
						maxLength={500}
						onChange={(e) => {
							const sanitized = e.target.value.replace(/[^a-zA-Z0-9]/g, "");
							if (!sanitized) {
								setReward({ ...reward, promo_codes: [] });
								return;
							}
							setReward({
								...reward,
								promo_codes: [{ ...promoCode, code: sanitized }],
							});
						}}
					/>
				</div>
				<div className="w-32">
					<FormLabel>Max Uses</FormLabel>
					<Input
						type="number"
						min={1}
						step={1}
						disabled={!hasCode}
						value={promoCode ? (getGlobalMaxRedemption(promoCode) ?? "") : ""}
						onChange={(e) =>
							updatePromoCode({
								global_max_redemption: e.target.value
									? Math.max(1, Math.floor(Number(e.target.value)))
									: undefined,
							})
						}
						placeholder="Unlimited"
					/>
				</div>
			</div>

			<div className="flex items-center gap-1.5">
				<TextCheckbox
					checked={promoCode?.first_time_transaction ?? false}
					disabled={!hasCode}
					onCheckedChange={(checked) =>
						updatePromoCode({ first_time_transaction: checked === true })
					}
				>
					Limit to first-time customers
				</TextCheckbox>
				<FirstTimeTransactionTooltip />
			</div>
		</div>
	);
}
