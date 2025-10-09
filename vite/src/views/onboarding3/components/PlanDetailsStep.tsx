import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { LongInput } from "@/components/v2/inputs/LongInput";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useAutoSlug } from "@/hooks/common/useAutoSlug";
import { useProductContext } from "@/views/products/product/ProductContext";
import { BasePriceSection } from "../../products/plan/components/edit-plan-details/BasePriceSection";
import { useOnboardingSteps } from "../hooks/useOnboardingSteps";
import { OnboardingStep } from "../utils/onboardingUtils";

export const PlanDetailsStep = () => {
	const { product, setProduct } = useProductContext();
	const { setSource, setTarget } = useAutoSlug({
		state: product,
		setState: setProduct,
		sourceKey: "name",
		targetKey: "id",
	});
	const { step } = useOnboardingSteps();

	return (
		<>
			<SheetSection title="Plan Details">
				<div className="space-y-4">
					<div className="grid grid-cols-1 gap-4">
						<div>
							<FormLabel>Name</FormLabel>
							<Input
								placeholder="eg. Pro Plan"
								value={product?.name || ""}
								onChange={(e) => setSource(e.target.value)}
								className="mb-1"
							/>

							<span className="text-form-label block">
								Used to create a product in Stripe and show up on your checkout
								pages.
							</span>
						</div>
						<div>
							<FormLabel>ID</FormLabel>
							<Input
								placeholder="eg. pro_plan"
								value={product?.id || ""}
								onChange={(e) => setTarget(e.target.value)}
								className="mb-1"
							/>
							<span className="text-form-label block">
								You'll use this when using Autumn's APIs or SDKs to refer to
								this product.
							</span>
						</div>
						{step === OnboardingStep.Playground && (
							<div className="col-span-1">
								<FormLabel>Description</FormLabel>
								<LongInput
									placeholder="eg. This plan includes 100 credits"
									value={product?.description || ""}
									onChange={(e) =>
										setProduct({
											...product,
											description: e.target.value,
										})
									}
								/>
							</div>
						)}
					</div>
				</div>
			</SheetSection>

			<BasePriceSection />
		</>
	);
};
