import { Accordion } from "@/components/ui/accordion";
import { useProductContext } from "./ProductContext";
import { Minus, Plus } from "lucide-react";
import { SideAccordion } from "@/components/general/SideAccordion";
import { useState } from "react";
import { CreateFreeTrial } from "./free-trial/CreateFreeTrial";
import { FreeTrialView } from "./free-trial/FreeTrialView";
import { ProductProps } from "./ProductProps";
import { ProductVersions } from "./ProductVersions";
import { notNullish } from "@/utils/genUtils";
import { AttachButton } from "@/views/customers/customer/product/components/AttachButton";
import { CustomerProductBadge } from "@/views/customers/customer/product/components/CustomerProductBadge";
import { EntitiesSidebar } from "./product-item/EntitiesSidebar";
import { UpdateProductButton } from "./components/UpdateProductButton";

export default function ProductSidebar() {
  const { product, org, setProduct, customer, features } = useProductContext();
  const [freeTrialModalOpen, setFreeTrialModalOpen] = useState(false);
  const [entitiesOpen, setEntitiesOpen] = useState(false);
  const [accordionValues, setAccordionValues] = useState([
    "properties",
    "versions",
    "free-trial",
    "entities",
  ]);

  const handleFreeTrialModalOpen = () => {
    setFreeTrialModalOpen(!freeTrialModalOpen);
  };
  const handleDeleteFreeTrial = async () => {
    setProduct({ ...product, free_trial: null });
  };

  const isCustomerProductView = notNullish(customer);

  const handleAccordionToggle = (value: string) => {
    setAccordionValues((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  return (
    <div className="flex-col gap-4 h-full border-l py-6">
      <div className="flex items-center gap-2 justify-start px-4">
        {isCustomerProductView && <CustomerProductBadge />}
      </div>

      <Accordion
        type="multiple"
        className="w-full flex flex-col"
        value={accordionValues}
        onValueChange={setAccordionValues}
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
        <div className="flex w-full border-b p-4 relative">
          <SideAccordion
            title="Entities"
            value="entities"
            isOpen={accordionValues.includes("entities")}
            onToggle={handleAccordionToggle}
            onClick={() => setEntitiesOpen(!entitiesOpen)}
            buttonIcon={<Plus size={14} />}
          >
            <EntitiesSidebar open={entitiesOpen} setOpen={setEntitiesOpen} />
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
        <div className="flex gap-2 px-4 py-6 w-full">
          {isCustomerProductView ? <AttachButton /> : <UpdateProductButton />}
        </div>
      </Accordion>
    </div>
  );
}
