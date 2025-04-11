import { useCustomerContext } from "./CustomerContext";
import { getStripeCusLink } from "@/utils/linkUtils";
import { Product } from "@autumn/shared";
import { faStripe } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ArrowUpRightFromSquare, Check } from "lucide-react";
import { Copy } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { SideAccordion } from "@/components/general/SideAccordion";
import { Accordion } from "@/components/ui/accordion";

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
    <div className="flex-col gap-4 h-full border-l py-6">
      <Accordion
        type="multiple"
        className="w-full flex flex-col"
        defaultValue={["details"]}
      >
        <div className="flex w-full border-b mt-[2px] p-4">
          <SideAccordion title="Details" value="details">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-t3 text-xs font-medium">Name</span>
                <span>
                  {customer.name || <span className="text-t3">N/A</span>}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-t3 text-xs font-medium">ID</span>
                <div className="flex items-center gap-2">
                  <p
                    onMouseEnter={() => setIdHover(true)}
                    onMouseLeave={() => setIdHover(false)}
                    className="flex items-center gap-1 font-mono hover:underline cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(customer.id);
                      setIdCopied(true);
                      setTimeout(() => setIdCopied(false), 1000);
                    }}
                  >
                    {customer.id}
                  </p>
                  {(idCopied || idHover) && (
                    <div className="flex items-center justify-center">
                      {idCopied ? <Check size={13} /> : <Copy size={13} />}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-t3 text-xs font-medium">Email</span>
                {customer.email ? (
                  <span className="text-blue-500 underline">
                    {customer.email}
                  </span>
                ) : (
                  <span className="text-t3">N/A</span>
                )}
              </div>

              {customer.fingerprint && (
                <div className="flex items-center justify-between">
                  <span className="text-t3 text-xs font-medium">
                    Fingerprint
                  </span>
                  <span>{customer.fingerprint}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-t3 text-xs font-medium">Products</span>
                <span>
                  {customer.products
                    .map(
                      (p: any) =>
                        products.find(
                          (prod: Product) => prod.id === p.product_id
                        )?.name
                    )
                    .join(", ")}
                </span>
              </div>

              {discount && (
                <div className="flex items-center justify-between">
                  <span className="text-t3 text-xs font-medium">Discount</span>
                  <span>{getDiscountText(discount)}</span>
                </div>
              )}

              {customer.processor?.id && (
                <div className="flex items-center justify-between">
                  <span className="text-t3 text-xs font-medium">Stripe</span>
                  <Link
                    className="!cursor-pointer hover:underline"
                    to={getStripeCusLink(customer.processor?.id, env)}
                    target="_blank"
                  >
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon
                        icon={faStripe}
                        className="!h-5 text-[#675DFF]"
                      />
                      <ArrowUpRightFromSquare
                        size={10}
                        className="text-[#675DFF]"
                      />
                    </div>
                  </Link>
                </div>
              )}
            </div>
          </SideAccordion>
        </div>
      </Accordion>
    </div>
  );
};
