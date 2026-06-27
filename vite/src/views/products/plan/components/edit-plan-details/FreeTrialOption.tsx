import { type FreeTrial, notNullish } from "@autumn/shared";
import { Switch } from "@autumn/ui";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { getDefaultFreeTrial } from "../../utils/getDefaultFreeTrial";
import { FreeTrialSection } from "./FreeTrialSection";

export const FreeTrialOption = () => {
	const { product, setProduct } = useProduct();

	return (
		<ConfigRow
			title={product.planType === "free" ? "Limited-time trial" : "Free trial"}
			description="Enable a free trial period for customers to try this plan"
			expanded={notNullish(product.free_trial)}
			action={
				<Switch
					checked={notNullish(product.free_trial)}
					onCheckedChange={(checked) =>
						setProduct({
							...product,
							free_trial: checked ? (getDefaultFreeTrial() as FreeTrial) : null,
						})
					}
				/>
			}
		>
			<FreeTrialSection />
		</ConfigRow>
	);
};
