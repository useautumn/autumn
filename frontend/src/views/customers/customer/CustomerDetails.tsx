import CopyButton from "@/components/general/CopyButton";
import { useCustomerContext } from "./CustomerContext";
import Link from "next/link";
import { getStripeCusLink } from "@/utils/linkUtils";
import { faStripe } from "@fortawesome/free-brands-svg-icons";
import {
  faArrowUpRightFromSquare,
  faCheck,
  faCopy,
} from "@fortawesome/pro-duotone-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Divider } from "@nextui-org/react";
import { useState } from "react";

export const CustomerDetails = () => {
  const { customer, products, env, discount } = useCustomerContext();
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
        <p>{customer.name}</p>
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
            <FontAwesomeIcon
              icon={idCopied ? faCheck : faCopy}
              size="xs"
              onClick={() => {
                navigator.clipboard.writeText(customer.id);
                setIdCopied(true);
              }}
            />
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
            .map((p) => products.find((prod) => prod.id === p.product_id)?.name)
            .join(", ")}
        </p>

        {discount && (
          <>
            <p className="text-t3 text-xs font-medium">Discount</p>
            {getDiscountText(discount)}
          </>
        )}

        {customer.processor?.id && (
          <Link
            className="!cursor-pointer hover:underline"
            href={getStripeCusLink(customer.processor?.id, env)}
            target="_blank"
          >
            <div className="flex justify-center items-center w-fit gap-2">
              <FontAwesomeIcon icon={faStripe} className="text-[#675DFF] h-6" />
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="text-[#675DFF]"
                size="xs"
              />
            </div>
          </Link>
        )}
      </div>
    </div>
  );
};
