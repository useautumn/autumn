import { useState } from "react";
import { Accordion } from "@/components/ui/accordion";
import { Dialog } from "@/components/ui/dialog";
import { CustomerRewards } from "./customer-rewards";
import { useCustomerContext } from "../CustomerContext";
import UpdateCustomerDialog from "../UpdateCustomerDialog";
import { CustomerToolbar } from "../CustomerToolbar";
import { CustomerDetails } from "./customer-details";
import { CustomerEntities } from "./CustomerEntities";

export const CustomerSidebar = () => {
  const { customer, entities } = useCustomerContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState("coupon");

  return (
    <div className="flex-col gap-4 h-full border-l py-2 whitespace-nowrap text-t2">
      <div className="flex w-full justify-end px-4">
        <CustomerToolbar customer={customer} />
      </div>
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <UpdateCustomerDialog
          selectedCustomer={customer}
          open={isModalOpen}
          setOpen={setIsModalOpen}
        />
      </Dialog>
      <Accordion
        type="multiple"
        className="w-full flex flex-col"
        defaultValue={["details", "rewards", "entities"]}
      >
        <CustomerDetails
          setIsModalOpen={setIsModalOpen}
          setModalType={setModalType}
        />
        <CustomerRewards />
        {entities.length > 0 && <CustomerEntities />}
      </Accordion>
    </div>
  );
};
