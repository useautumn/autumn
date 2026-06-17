import { CouponDurationType } from "@autumn/shared";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupText,
} from "@/components/v2/inputs/InputGroup";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useOrg } from "@/hooks/common/useOrg";
import type { FrontendReward } from "../../types/frontendReward";
import { ProductPriceSelector } from "./ProductPriceSelector";
import { PromoCodeField } from "./PromoCodeField";

interface DiscountRewardConfigProps {
	reward: FrontendReward;
	setReward: (reward: FrontendReward) => void;
}

export function DiscountRewardConfig({
	reward,
	setReward,
}: DiscountRewardConfigProps) {
	const { org } = useOrg();
	const config = reward.discount_config!;

	const setConfig = (key: string, value: any) => {
		setReward({
			...reward,
			discount_config: { ...config, [key]: value },
		});
	};

	const showDurationValue = config.duration_type === CouponDurationType.Months;

	return (
		<SheetSection title="Discount Configuration" withSeparator={false}>
			<div className="flex flex-col gap-4">
				{/* Row 1: Discount Type and Amount */}
				<div className="grid grid-cols-2 gap-2">
					<div className="flex flex-col">
						<FormLabel>Discount Type</FormLabel>
						<Select
							value={reward.discountType || undefined}
							onValueChange={(value) =>
								setReward({ ...reward, discountType: value as any })
							}
							items={{
								percentage: "Percentage",
								fixed: "Fixed",
								...(reward.discountType === "invoice_credits" && {
									invoice_credits: "Invoice Credits",
								}),
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select discount type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="percentage">Percentage</SelectItem>
								<SelectItem value="fixed">Fixed</SelectItem>
								{reward.discountType === "invoice_credits" && (
									<SelectItem value="invoice_credits">
										Invoice Credits
									</SelectItem>
								)}
							</SelectContent>
						</Select>
					</div>

					<div>
						<FormLabel>Amount</FormLabel>
						<InputGroup className="input-base p-2">
							<input
								type="number"
								placeholder="20"
								value={config.discount_value === 0 ? "" : config.discount_value}
								onChange={(e) => {
									const value =
										e.target.value === "" ? 0 : Number(e.target.value);
									setConfig("discount_value", value);
								}}
								className="flex-1 bg-transparent outline-none"
							/>
							<InputGroupAddon align="inline-end">
								<InputGroupText className="text-tertiary-foreground">
									{reward.discountType === "percentage"
										? "%"
										: org?.default_currency.toUpperCase() || "USD"}
								</InputGroupText>
							</InputGroupAddon>
						</InputGroup>
					</div>
				</div>

				{/* Row 2: Duration */}
				<div className="grid grid-cols-2 gap-2">
					<div>
						<FormLabel>Duration</FormLabel>
						<div className="flex items-center gap-2">
							{showDurationValue && (
								<Input
									type="number"
									placeholder="3"
									className="w-20"
									value={
										config.duration_value === 0 ? "" : config.duration_value
									}
									onChange={(e) => {
										const value =
											e.target.value === "" ? 0 : Number(e.target.value);
										setConfig("duration_value", value);
									}}
								/>
							)}
							<Select
								value={config.duration_type}
								onValueChange={(value) =>
									setConfig("duration_type", value as CouponDurationType)
								}
								items={{
									[CouponDurationType.OneOff]: "One-off",
									[CouponDurationType.Months]: "Months",
									[CouponDurationType.Forever]: "Forever",
								}}
							>
								<SelectTrigger className="flex-1">
									<SelectValue placeholder="Select duration" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={CouponDurationType.OneOff}>
										One-off
									</SelectItem>
									<SelectItem value={CouponDurationType.Months}>
										Months
									</SelectItem>
									<SelectItem value={CouponDurationType.Forever}>
										Forever
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>

				<PromoCodeField reward={reward} setReward={setReward} />

				{/* Products */}
				<div className="w-full">
					<FormLabel>Products</FormLabel>
					<ProductPriceSelector reward={reward} setReward={setReward} />
				</div>
			</div>
		</SheetSection>
	);
}
