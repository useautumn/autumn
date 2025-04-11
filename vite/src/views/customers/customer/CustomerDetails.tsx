import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCustomerContext } from "./CustomerContext";
import { getStripeCusLink } from "@/utils/linkUtils";
import { Product } from "@autumn/shared";
import { faStripe } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ArrowUpRightFromSquare, Check } from "lucide-react";
import { Copy } from "lucide-react";
import React from "react";
import { useState } from "react";
import { Link } from "react-router";

export const CustomerDetails = () => {
  const { customer, products, env, discount, referrals } = useCustomerContext();
  const [idCopied, setIdCopied] = useState(false);
  const [idHover, setIdHover] = useState(false);

  const getDiscountText = (discount: any) => {
    const coupon = discount.coupon;
    if (coupon.amount_off) {
      return (
        <p>
          {`${coupon.name} `}
          <span className="text-t3">
            (${coupon.amount_off / 100} {coupon.currency.toUpperCase()})
          </span>
        </p>
      );
    }
    if (coupon.percent_off) {
      return (
        <p>
          {`${coupon.name} `}
          <span className="text-t3">({coupon.percent_off}% off)</span>
        </p>
      );
    }
    return coupon.name;
  };
  return (
    <div className="ml-8">
      <h2 className="text-t2 mb-4 font-medium text-md">Details</h2>
      <div
        className="items-center gap-y-3 gap-x-4 w-full rounded-none break-all
        border-l  pl-4 grid grid-cols-[auto_1fr] 
      "
      >
        {/* <div className="flex flex-col gap-1"> */}
        <p className="text-t3 text-xs font-medium">Name</p>
        <p>
          {customer.name ? (
            customer.name
          ) : (
            <span className="text-t3 text-xs font-medium">N/A</span>
          )}
        </p>
        {/* </div> */}

        <p className="text-t3 text-xs font-medium">ID</p>
        <div className="flex items-center gap-2">
          <p
            onMouseEnter={() => setIdHover(true)}
            onMouseLeave={() => setIdHover(false)}
            className="flex items-center gap-1 font-mono hover:underline cursor-pointer "
            onClick={() => {
              navigator.clipboard.writeText(customer.id);
              setIdCopied(true);
              setTimeout(() => {
                setIdCopied(false);
              }, 1000);
            }}
          >
            {customer.id}
          </p>
          {(idCopied || idHover) && (
            <div
              className="flex items-center justify-center"
              onClick={() => {
                navigator.clipboard.writeText(customer.id);
                setIdCopied(true);
              }}
            >
              {idCopied ? <Check size={13} /> : <Copy size={13} />}
            </div>
          )}
        </div>

        <p className="text-t3 text-xs font-medium">Email</p>
        {customer.email ? (
          <p className="text-blue-500 py-0.5 w-fit underline">
            {customer.email}
          </p>
        ) : (
          <p className="text-t3 text-xs font-medium">N/A</p>
        )}

        {customer.fingerprint && (
          <>
            <p className="text-t3 text-xs font-medium">Fingerprint</p>
            <p>{customer.fingerprint}</p>
          </>
        )}

        <p className="text-t3 text-xs font-medium">Products</p>
        <p>
          {customer.products
            .map(
              (p: any) =>
                products.find((prod: Product) => prod.id === p.product_id)?.name
            )
            .join(", ")}
        </p>

        {discount && (
          <>
            <p className="text-t3 text-xs font-medium">Discount</p>
            {getDiscountText(discount)}
          </>
        )}

        <ReferralDetails />

        {customer.processor?.id && (
          <React.Fragment>
            <Link
              className="!cursor-pointer hover:underline"
              to={getStripeCusLink(customer.processor?.id, env)}
              target="_blank"
            >
              <div className="flex justify-center items-center w-fit gap-2">
                <FontAwesomeIcon
                  icon={faStripe}
                  className="!h-5 text-[#675DFF]"
                />
                <ArrowUpRightFromSquare size={10} className="text-[#675DFF]" />
              </div>
            </Link>
            <p></p>
          </React.Fragment>
        )}
      </div>
    </div>
  );
};

export const ReferralDetails = () => {
  let { referrals } = useCustomerContext();
  if (!referrals) return null;
  return (
    <>
      {referrals.referred.length > 0 && (
        <>
          <p className="text-t3 text-xs font-medium">Referrals</p>

          <Tooltip>
            <TooltipTrigger className="flex items-center justify-start gap-1">
              <p>
                {referrals.referred.length}{" "}
                <span className="text-t3">
                  ({referrals.referred.filter((r: any) => r.triggered).length}{" "}
                  activated)
                </span>
              </p>
            </TooltipTrigger>
            <TooltipContent
              className="px-2"
              align="start"
              side="bottom"
              sideOffset={5}
            >
              <div
                // key={referral.id}
                className="flex grid grid-cols-2 gap-1 font-mono"
              >
                {referrals.referred.map((referral: any) => (
                  <>
                    <p className="font-medium max-w-[140px] truncate">
                      {referral.customer.name}
                    </p>
                    <p className="text-t2 max-w-[100px] truncate">
                      ({referral.customer.id})
                    </p>
                  </>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </>
      )}
      {referrals.redeemed.length > 0 && (
        <>
          <p className="text-t3 text-xs font-medium">Redeemed</p>
          <Tooltip>
            <TooltipTrigger className="flex items-center justify-start gap-1">
              <p>{referrals.redeemed[0].referral_code.code}</p>
            </TooltipTrigger>
            <TooltipContent
              className="px-2 font-mono flex flex-col gap-1"
              align="start"
              side="bottom"
              sideOffset={5}
            >
              <p className="font-medium">Referred by: </p>
              <p>
                {referrals.redeemed[0].referral_code?.customer.name} (
                {referrals.redeemed[0].referral_code?.customer.id})
              </p>
            </TooltipContent>
          </Tooltip>
        </>
      )}
    </>
  );
};
