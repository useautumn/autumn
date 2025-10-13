import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getStripeSubLink, getStripeSubScheduleLink } from "@/utils/linkUtils";
import { CusProductStatus, FullCusProduct } from "@autumn/shared";
import { ArrowUpRightFromSquare } from "lucide-react";
import React from "react";
import { Link } from "react-router";
import { toast } from "sonner";

export const CusProductStripeLink = ({
  cusProduct,
}: {
  cusProduct: FullCusProduct;
}) => {
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
    <>
      {cusProduct.subscription_ids &&
        cusProduct.subscription_ids.length > 0 && (
          <React.Fragment>
            {cusProduct.subscription_ids.map((subId: string) => {
              return (
                <div
                  key={subId}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const account = await getStripeAccountInfo();
                    if (account) {
                      window.open(
                        getStripeSubLink(subId, env, account.id),
                        "_blank"
                      );
                    } else {
                      window.open(getStripeSubLink(subId, env));
                    }
                  }}
                >
                  <div className="flex justify-center items-center w-fit px-2 gap-2 h-6">
                    <ArrowUpRightFromSquare
                      size={12}
                      className="text-[#665CFF]"
                    />
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        )}
      {cusProduct.status == CusProductStatus.Scheduled &&
        cusProduct.scheduled_ids &&
        cusProduct.scheduled_ids.length > 0 && (
          <React.Fragment>
            {cusProduct.scheduled_ids.map((subId: string) => {
              return (
                <div
                  key={subId}
                  onClick={async (e) => {
                    e.stopPropagation();
                    const account = await getStripeAccountInfo();
                    if (account) {
                      window.open(
                        getStripeSubScheduleLink(subId, env, account.id),
                        "_blank"
                      );
                    } else {
                      window.open(getStripeSubScheduleLink(subId, env));
                    }
                  }}
                >
                  <div className="flex justify-center items-center w-fit px-2 gap-2 h-6">
                    <ArrowUpRightFromSquare
                      size={12}
                      className="text-[#665CFF]"
                    />
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        )}
    </>
  );
};
