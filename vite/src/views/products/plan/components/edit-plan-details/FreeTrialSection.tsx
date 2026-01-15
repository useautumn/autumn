import { FreeTrialDuration } from "@autumn/shared";
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
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";

export const FreeTrialSection = () => {
	const { product, setProduct } = useProduct();
	const lengthId = useId();

	return (
		// <SheetSection
		// 	title="Free Trial"
		// 	checked={notNullish(product.free_trial)}
		// 	setChecked={(checked) => {
		// 		if (checked) {
		// 			setProduct({ ...product, free_trial: getDefaultFreeTrial() });
		// 		} else {
		// 			setProduct({ ...product, free_trial: null });
		// 		}
		// 	}}
		// 	withSeparator={false}
		// >
		<div className="flex flex-col gap-4 text-sm mt-2">
			<div className="w-full">
				<FormLabel disabled={!product.free_trial}>Duration</FormLabel>
				<div className="flex items-center gap-1 w-full">
					<Input
						id={lengthId}
						value={product.free_trial?.length || ""}
						className="min-w-12 max-w-24"
						disabled={!product.free_trial}
						onChange={(e) => {
							const val = e.target.value;
							setProduct({
								...product,
								free_trial: product.free_trial
									? {
											...product.free_trial,
											length: val === "" ? 0 : parseInt(val),
										}
									: null,
							});
						}}
						placeholder="eg. 7"
					/>
					{/* <FormLabel disabled={!product.free_trial}>Duration</FormLabel> */}
					<Select
						disabled={!product.free_trial}
						value={product.free_trial?.duration || ""}
						onValueChange={(value) => {
							setProduct({
								...product,
								free_trial: product.free_trial
									? {
											...product.free_trial,
											duration: value as FreeTrialDuration,
										}
									: null,
							});
						}}
					>
						<SelectTrigger className="w-full max-w-32">
							<SelectValue placeholder="days" />{" "}
						</SelectTrigger>
						<SelectContent>
							{Object.values(FreeTrialDuration).map((duration) => (
								<SelectItem key={duration} value={duration}>
									{duration}s
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{product.planType === "paid" && (
						<div className="mx-4">
							<TextCheckbox
								disabled={!product.free_trial}
								checked={product.free_trial?.card_required || false}
								onCheckedChange={(checked) => {
									setProduct({
										...product,
										free_trial: product.free_trial
											? {
													...(product.free_trial || {}),
													card_required: checked as boolean,
												}
											: null,
									});
								}}
							>
								Card Required
							</TextCheckbox>
						</div>
					)}
				</div>
			</div>
		</div>
		// </SheetSection>
	);
};
