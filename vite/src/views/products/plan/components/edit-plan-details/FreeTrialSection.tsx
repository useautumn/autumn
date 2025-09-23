import { FreeTrialDuration, notNullish } from "@autumn/shared";
import { useId } from "react";
import { TextCheckbox } from "@/components/v2/checkboxes/TextCheckbox";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProductContext } from "@/views/products/product/ProductContext";
import { getDefaultFreeTrial } from "../../utils/getDefaultFreeTrial";

export const FreeTrialSection = () => {
	const { product, setProduct } = useProductContext();
	const lengthId = useId();

	return (
		<SheetSection
			title="Free Trial"
			checked={notNullish(product.free_trial)}
			setChecked={(checked) => {
				if (checked) {
					setProduct({ ...product, free_trial: getDefaultFreeTrial() });
				} else {
					console.log("setting free trial to null");
					setProduct({ ...product, free_trial: null });
				}
			}}
			withSeparator={false}
		>
			<div className="flex flex-col gap-4 text-sm">
				<div className="grid grid-cols-2 gap-2 w-full">
					<div className="w-full">
						<FormLabel disabled={!product.free_trial}>Length</FormLabel>
						<Input
							id={lengthId}
							value={product.free_trial?.length || ""}
							disabled={!product.free_trial}
							onChange={(e) => {
								setProduct({
									...product,
									free_trial: {
										...product.free_trial,
										length: e.target.value as unknown as number,
									},
								});
							}}
							placeholder="eg. 7"
						/>
					</div>
					<div className="w-full">
						<FormLabel disabled={!product.free_trial}>Duration</FormLabel>
						<Select
							disabled={!product.free_trial}
							value={product.free_trial?.duration || ""}
							onValueChange={(value) => {
								setProduct({
									...product,
									free_trial: {
										...product.free_trial,
										duration: value as FreeTrialDuration,
									},
								});
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select a duration" />{" "}
							</SelectTrigger>
							<SelectContent>
								{Object.values(FreeTrialDuration).map((duration) => (
									<SelectItem key={duration} value={duration}>
										{duration}s
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<TextCheckbox
					disabled={!product.free_trial}
					checked={product.free_trial?.card_required || false}
					onCheckedChange={(checked) => {
						setProduct({
							...product,
							free_trial: {
								...product.free_trial,
								card_required: checked as boolean,
							},
						});
					}}
				>
					Card Required
				</TextCheckbox>
			</div>
		</SheetSection>
	);
};
