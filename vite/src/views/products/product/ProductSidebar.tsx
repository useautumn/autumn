import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { useProductContext } from "./ProductContext";
import { ToggleDisplayButton } from "@/components/general/ToggleDisplayButton";
import { Gift, Minus, Plus } from "lucide-react";
import { AddProductButton } from "@/views/customers/customer/add-product/AddProductButton";
import { SideAccordion } from "@/components/general/SideAccordion";
import { useState } from "react";
import { CreateFreeTrial } from "./free-trial/CreateFreeTrial";
import { FreeTrialView } from "./free-trial/FreeTrialView";
import { ProductProps } from "./ProductProps";
import { ProductVersions } from "./ProductVersions";

export default function ProductSidebar() {
  const { product, org, setProduct } = useProductContext();
  const [freeTrialModalOpen, setFreeTrialModalOpen] = useState(false);

  const handleFreeTrialModalOpen = () => {
    setFreeTrialModalOpen(!freeTrialModalOpen);
  };
  const handleDeleteFreeTrial = async () => {
    setProduct({ ...product, free_trial: null });
  };

  return (
    <div className="flex-col gap-4 h-full border-l py-6">
      {/* <ToggleDisplayButton
        show={showFreeTrial}
        onClick={() => setShowFreeTrial(!showFreeTrial)}
        disabled={product.free_trial}
      >
        <Gift size={14} />
        Free trial
      </ToggleDisplayButton> */}
      <Accordion
        type="multiple"
        className="w-full flex flex-col"
        defaultValue={[
          "properties",
          ...(product.free_trial ? ["free-trial"] : []),
        ]}
      >
        <div className="flex w-full border-b mt-[2px] p-4">
          <SideAccordion title="Properties" value="properties">
            <ProductProps />
          </SideAccordion>
        </div>
        <div className="flex w-full border-b p-4">
          <SideAccordion title="Versions" value="versions">
            <ProductVersions />
          </SideAccordion>
        </div>

        <CreateFreeTrial
          open={freeTrialModalOpen}
          setOpen={setFreeTrialModalOpen}
        />
        <div className="flex w-full border-b p-4">
          <SideAccordion
            title="Free Trial"
            value="free-trial"
            onClick={
              product.free_trial
                ? handleDeleteFreeTrial
                : handleFreeTrialModalOpen
            }
            buttonIcon={
              product.free_trial ? <Minus size={14} /> : <Plus size={14} />
            }
          >
            <div>
              {product.free_trial ? (
                <FreeTrialView product={product} />
              ) : (
                <span className="text-t3">
                  Add a free trial to this product.
                </span>
              )}
            </div>
          </SideAccordion>
        </div>
        {/* <SideAccordion title="Product" value="product">
          <div className="flex flex-col gap-2 p-2 px-4">
            <div className="flex items-center justify-between">
              <span>Status</span>
              <span className="text-muted-foreground">Active</span>
            </div>
          </div>
        </SideAccordion> */}
      </Accordion>
    </div>
  );
}
