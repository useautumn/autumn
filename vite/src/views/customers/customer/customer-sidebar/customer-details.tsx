import CopyButton from "@/components/general/CopyButton";
import { SideAccordion } from "@/components/general/SideAccordion";
import { getStripeCusLink } from "@/utils/linkUtils";
import { faStripe } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ArrowUpRightFromSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { useCustomerContext } from "../CustomerContext";
import { useEnv } from "@/utils/envUtils";
import { SidebarLabel } from "@/components/general/sidebar/sidebar-label";
export const CustomerDetails = ({
  setIsModalOpen,
  setModalType,
}: {
  setIsModalOpen: (isModalOpen: boolean) => void;
  setModalType: (modalType: string) => void;
}) => {
  const { customer } = useCustomerContext();
  const env = useEnv();

  return (
    <div className="flex w-full border-b mt-[2.5px] p-4">
      <SideAccordion title="Details" value="details">
        <div className="grid grid-cols-8 auto-rows-[16px] gap-y-4 w-full items-center">
          <SidebarLabel>ID</SidebarLabel>
          <div className="col-span-6 justify-end flex">
            <div className="w-full flex justify-end">
              <CopyButton text={customer.id} className="">
                {customer.id}
              </CopyButton>
            </div>
          </div>

          <span className="text-t3 text-xs font-medium col-span-2">Name</span>
          <div className="col-span-6 justify-end flex">
            <Button
              variant="sidebarItem"
              onClick={() => {
                setIsModalOpen(true);
                setModalType("customer");
              }}
            >
              <span className="truncate">
                {customer.name || <span className="text-t3">None</span>}
              </span>
            </Button>
          </div>

          <span className="text-t3 text-xs font-medium col-span-2">Email</span>
          <div className="col-span-6 justify-end flex">
            <Button
              variant="sidebarItem"
              onClick={() => {
                setIsModalOpen(true);
                setModalType("customer");
              }}
            >
              <span className="truncate">
                {customer.email || <span className="text-t3">None</span>}
              </span>
            </Button>
          </div>

          <span className="text-t3 text-xs font-medium col-span-2">
            Fingerprint
          </span>
          <div className="col-span-6 justify-end flex">
            <Button
              variant="sidebarItem"
              className="text-t2 px-2 h-fit py-0.5"
              onClick={() => {
                setIsModalOpen(true);
                setModalType("customer");
              }}
            >
              <span className="truncate">
                {customer.fingerprint || <span className="text-t3">None</span>}
              </span>
            </Button>
          </div>

          {customer.processor?.id && (
            <>
              <span className="text-t3 text-xs font-medium col-span-2 h-4">
                Stripe
              </span>
              <div className="col-span-6">
                <Link
                  className="!cursor-pointer hover:underline"
                  to={getStripeCusLink(customer.processor?.id, env)}
                  target="_blank"
                >
                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      variant="sidebarItem"
                      // className="bg-white border shadow-sm rounded-md gap-2 h-6 max-h-6 !py-0"
                    >
                      <FontAwesomeIcon
                        icon={faStripe}
                        className="!h-6 text-t2"
                      />
                      <ArrowUpRightFromSquare size={12} className="text-t2" />
                    </Button>
                  </div>
                </Link>
              </div>
            </>
          )}
        </div>
      </SideAccordion>
    </div>
  );
};
