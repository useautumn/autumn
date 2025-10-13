import CopyButton from "@/components/general/CopyButton";
import { SideAccordion } from "@/components/general/SideAccordion";
import { getStripeCusLink } from "@/utils/linkUtils";
import { faStripe } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ArrowUpRightFromSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { useEnv } from "@/utils/envUtils";
import { SidebarLabel } from "@/components/general/sidebar/sidebar-label";
import { useCusQuery } from "../../hooks/useCusQuery";
import { useOrg } from "@/hooks/common/useOrg";
import Stripe from "stripe";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";

export const CustomerDetails = ({
  setIsModalOpen,
  setModalType,
}: {
  setIsModalOpen: (isModalOpen: boolean) => void;
  setModalType: (modalType: string) => void;
}) => {
  const { customer } = useCusQuery();
  const env = useEnv();
  const { org } = useOrg();

  const axiosInstance = useAxiosInstance();

  const getStripeAccountInfo = async () => {
    try {
      const { data } = await axiosInstance.get(`/organization/stripe`);
      return data;
    } catch (error) {
      toast.error("Failed to get invoice URL");
      return null;
    }
  };

  return (
    <div className="flex w-full border-b mt-[2.5px] p-4">
      <SideAccordion title="Details" value="details">
        <div className="grid grid-cols-8 auto-rows-[16px] gap-y-4 w-full items-center">
          <SidebarLabel>ID</SidebarLabel>
          <div className="col-span-6 justify-end flex">
            <div className="w-full flex justify-end">
              {customer.id ? (
                <CopyButton text={customer.id} className="">
                  {customer.id}
                </CopyButton>
              ) : (
                <Button
                  variant="sidebarItem"
                  onClick={() => {
                    setIsModalOpen(true);
                    setModalType("customer");
                  }}
                >
                  <span className="truncate text-t3">N/A</span>
                </Button>
              )}
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
                <div className="!cursor-pointer hover:underline">
                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      variant="sidebarItem"
                      className="!cursor-pointer hover:underline"
                      onClick={async () => {
                        try {
                          const result = await getStripeAccountInfo();
                          if (result) {
                            console.log("result", result);
                            window.open(
                              getStripeCusLink(
                                customer.processor?.id,
                                env,
                                result.id
                              ),
                              "_blank"
                            );
                          } else {
                            window.location.href = getStripeCusLink(
                              customer.processor?.id,
                              env
                            );
                          }
                        } catch (err) {
                          console.error(
                            "Failed to get Stripe customer link:",
                            err
                          );
                        }
                      }}
                    >
                      <FontAwesomeIcon
                        icon={faStripe}
                        className="!h-6 !w-6 text-t2"
                      />
                      <ArrowUpRightFromSquare size={12} className="text-t2" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </SideAccordion>
    </div>
  );
};
