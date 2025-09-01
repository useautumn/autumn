import type { CreateFeature as CreateFeatureType } from "@autumn/shared";
import { useEffect, useState } from "react";
import {
	CustomDialogBody,
	CustomDialogContent,
} from "@/components/general/modal-components/DialogContentWrapper";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { getItemType } from "@/utils/product/productItemUtils";
import { CreateFeature } from "@/views/features/CreateFeature";
import { useProductContext } from "../../ProductContext";
import { ProductItemConfig } from "../ProductItemConfig";
import { useProductItemContext } from "../ProductItemContext";
import {
	AdvancedConfigSidebar,
	MainDialogBodyWrapper,
	ToggleAdvancedConfigButton,
} from "../product-item-config/AdvancedConfigSidebar";
import { ItemConfigFooter } from "../product-item-config/item-config-footer/ItemConfigFooter";
import { CreateItemStep } from "../utils/CreateItemStep";

export const CreateItemDialogContent = ({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const { features, setFeatures } = useProductContext();
	const { stepState, item, setItem } = useProductItemContext();

	const {
		stepVal,
		popStep,
		pushStep,
		resetSteps,
		previousStep,
		replaceStep,
		stepCount,
	} = stepState;

	useEffect(() => {
		if (open) {
			resetSteps();
		}
	}, [open, resetSteps]);

	const handleFeatureCreated = async (feature: CreateFeatureType) => {
		setFeatures([...features, feature]);
		setItem({ ...item, feature_id: feature.id! });

		// // replaceStep(CreateItemStep.CreateItem);
		// if (previousStep === CreateItemStep.CreateItem) {
		//   replaceStep(CreateItemStep.CreateItem);
		// } else {
		//   pushStep(CreateItemStep.CreateItem);
		// }
		replaceStep(CreateItemStep.CreateItem);
	};

	const itemType = getItemType(item);
	const [advancedOpen, setAdvancedOpen] = useState(false);

	useEffect(() => {
		if (!open) {
			setTimeout(() => {
				setAdvancedOpen(false);
			}, 300);
		}
	}, [open]);

	// Advanced sidebar width - adjust this value to change sidebar size
	const _ADVANCED_SIDEBAR_WIDTH = 320; // 320px = w-80 in Tailwind
	const showAdvancedButton =
		stepVal === CreateItemStep.CreateItem &&
		(!item.isPrice || item.isVariable === true);

	return (
		<CustomDialogContent className="!max-w-none">
			{stepVal === CreateItemStep.CreateFeature ? (
				<CreateFeature
					onSuccess={handleFeatureCreated}
					setOpen={setOpen}
					open={open}
					handleBack={stepCount > 1 ? popStep : undefined}
				/>
			) : (
				<div className="flex relative overflow-y-auto overflow-x-hidden w-full">
					{/* Main Dialog Content */}
					<MainDialogBodyWrapper advancedOpen={advancedOpen}>
						<CustomDialogBody className="!pb-0">
							<div className="flex flex-col gap-4">
								<DialogHeader className="p-0">
									<DialogTitle>Add {keyToTitle(itemType)}</DialogTitle>
								</DialogHeader>

								<div className="flex flex-col gap-4 w-fit !overflow-visible">
									<ProductItemConfig />
								</div>
							</div>
						</CustomDialogBody>

						<ToggleAdvancedConfigButton
							advancedOpen={advancedOpen}
							setAdvancedOpen={setAdvancedOpen}
							showAdvancedButton={showAdvancedButton}
						/>

						<ItemConfigFooter />
					</MainDialogBodyWrapper>
					<AdvancedConfigSidebar advancedOpen={advancedOpen} />
				</div>
			)}
		</CustomDialogContent>
	);
};

{
	/* <Tabs value={getTabValue()} onValueChange={handleTabChange}>
                <TabsList className="gap-2">
                  <TabsTrigger className={tabTriggerClass} value="feature">
                    Feature
                  </TabsTrigger>
                  <TabsTrigger
                    className={tabTriggerClass}
                    value="priced_feature"
                  >
                    Priced Feature
                  </TabsTrigger>
                  <TabsTrigger className={tabTriggerClass} value="price">
                    Price
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="config">
                  <ProductItemConfig />
                </TabsContent>
              </Tabs> */
}
