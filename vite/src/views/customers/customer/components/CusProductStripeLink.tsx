import { useEnv } from "@/utils/envUtils";
import { getStripeSubLink, getStripeSubScheduleLink } from "@/utils/linkUtils";
import { CusProductStatus, FullCusProduct } from "@autumn/shared";
import { ArrowUpRightFromSquare } from "lucide-react";
import React from "react";
import { Link } from "react-router";

export const CusProductStripeLink = ({
  cusProduct,
}: {
  cusProduct: FullCusProduct;
}) => {
  const env = useEnv();
  return (
    <>
      {cusProduct.subscription_ids &&
        cusProduct.subscription_ids.length > 0 && (
          <React.Fragment>
            {cusProduct.subscription_ids.map((subId: string) => {
              return (
                <Link
                  key={subId}
                  to={getStripeSubLink(subId, env)}
                  target="_blank"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <div className="flex justify-center items-center w-fit px-2 gap-2 h-6">
                    <ArrowUpRightFromSquare
                      size={12}
                      className="text-[#665CFF]"
                    />
                  </div>
                </Link>
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
                <Link
                  key={subId}
                  to={getStripeSubScheduleLink(subId, env)}
                  target="_blank"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                >
                  <div className="flex justify-center items-center w-fit px-2 gap-2 h-6">
                    <ArrowUpRightFromSquare
                      size={12}
                      className="text-[#665CFF]"
                    />
                  </div>
                </Link>
              );
            })}
          </React.Fragment>
        )}
    </>
  );
};
