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

import { useState } from "react";
import { Link } from "react-router";
import { SideAccordion } from "@/components/general/SideAccordion";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import React from "react";
import UpdateCustomerDialog from "./UpdateCustomerDialog";
import AddCouponDialogContent from "./add-coupon/AddCouponDialogContent";
import CopyButton from "@/components/general/CopyButton";
import { getRedirectUrl } from "@/utils/genUtils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const CustomerDetails = () => {
  const { customer, products, env, discount, referrals } = useCustomerContext();
  const [idCopied, setIdCopied] = useState(false);
  const [idHover, setIdHover] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState("coupon");
  const [tempFingerprint, setTempFingerprint] = useState(
    customer.fingerprint || ""
  );

  return (
    <div className="flex-col gap-4 h-full border-l py-6 whitespace-nowrap text-t2">
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
        defaultValue={["details", "rewards"]}
      >
        <div className="flex w-full border-b mt-[2.5px] p-4">
          <SideAccordion title="Details" value="details">
            <div className="grid grid-cols-8 auto-rows-[16px] gap-y-4 w-full items-center">
              <span className="text-t3 text-xs font-medium col-span-2">ID</span>
              <div className="col-span-6 justify-end flex">
                <div className="w-full flex justify-end">
                  <CopyButton text={customer.id} className="">
                    {customer.id}
                  </CopyButton>
                </div>
              </div>

              <span className="text-t3 text-xs font-medium col-span-2">
                Name
              </span>
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

              <span className="text-t3 text-xs font-medium col-span-2">
                Email
              </span>
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
                  variant="ghost"
                  className="text-t2 px-2 h-fit py-0.5"
                  onClick={() => {
                    // setTempFingerprint(customer.fingerprint || "");
                    setIsModalOpen(true);
                    setModalType("customer");
                  }}
                >
                  {customer.fingerprint || (
                    <span className="text-t3">None</span>
                  )}
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
                          <ArrowUpRightFromSquare
                            size={12}
                            className="text-t2"
                          />
                        </Button>
                      </div>
                    </Link>
                  </div>
                </>
              )}
            </div>
          </SideAccordion>
        </div>
        <RewardProps />
      </Accordion>
    </div>
  );
};

export const RewardProps = () => {
  const { discount, env } = useCustomerContext();
  const [isModalOpen, setIsModalOpen] = useState(false);

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
  let { referrals } = useCustomerContext();
  console.log("referrals", referrals);

  // if (!referrals) return null;

  return (
    <div className="flex w-full border-b mt-[2.5px] p-4">
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <AddCouponDialogContent setOpen={setIsModalOpen} />
      </Dialog>
      <SideAccordion title="Rewards" value="rewards">
        <div className="grid grid-cols-8 auto-rows-[16px] gap-y-4 w-full items-center">
          <>
            <span className="text-t3 text-xs font-medium col-span-2 h-4">
              Coupon
            </span>
            <div className="col-span-6 flex justify-end">
              <Button
                variant="sidebarItem"
                onClick={() => setIsModalOpen(true)}
              >
                {discount ? (
                  getDiscountText(discount)
                ) : (
                  <span className="text-t3">Add Coupon</span>
                )}
              </Button>
            </div>
          </>
          {referrals?.referred.length > 0 && (
            <>
              <span className="text-t3 text-xs font-medium col-span-2">
                Referrals
              </span>

              <Popover>
                <div className="col-span-6 justify-end flex">
                  <PopoverTrigger className="">
                    <Button variant="sidebarItem">
                      {referrals.referred.length} referred
                    </Button>
                  </PopoverTrigger>
                </div>

                <PopoverContent
                  className="p-2 text-xs text-t2 w-48"
                  align="end"
                  side="bottom"
                  sideOffset={5}
                >
                  <div className="flex flex-col gap-1">
                    {referrals.referred.map((referral: any) => (
                      <Link
                        to={getRedirectUrl(
                          `/customers/${referral.customer.id}`,
                          env
                        )}
                        className="flex justify-between hover:bg-zinc-100 items-center"
                        key={referral.customer.id}
                      >
                        <p className="max-w-40 truncate">
                          {referral.customer.name}
                        </p>
                        <ArrowUpRightFromSquare size={12} />
                      </Link>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <span className="text-t3 text-xs font-medium col-span-2">
                Activated
              </span>
              <Popover>
                <div className="col-span-6 justify-end flex">
                  <PopoverTrigger className="">
                    <Button variant="sidebarItem">
                      {
                        referrals.referred.filter((r: any) => r.triggered)
                          .length
                      }{" "}
                      activated
                    </Button>
                  </PopoverTrigger>
                </div>

                <PopoverContent
                  className="p-2 text-xs text-t2 w-48"
                  align="end"
                  side="bottom"
                  sideOffset={5}
                >
                  <div className="flex flex-col gap-1">
                    {referrals.referred
                      .filter((r: any) => r.triggered)
                      .map((referral: any) => (
                        <Link
                          to={getRedirectUrl(
                            `/customers/${referral.customer.id}`,
                            env
                          )}
                          className="flex justify-between hover:bg-zinc-100 items-center"
                          key={referral.customer.id}
                        >
                          <p className="max-w-40 truncate">
                            {referral.customer.name}
                          </p>
                          {/* <p className="text-t2 max-w-[100px] truncate font-mono">
                          ({referral.customer.id})
                        </p> */}
                          <ArrowUpRightFromSquare size={12} />
                        </Link>
                      ))}
                  </div>
                </PopoverContent>
              </Popover>
            </>
          )}
          {referrals?.redeemed.length > 0 && (
            <>
              <span className="text-t3 text-xs font-medium col-span-2">
                Referred by
              </span>
              <Tooltip>
                <TooltipTrigger className="flex items-center gap-1 col-span-6 justify-end">
                  <Button variant="sidebarItem">
                    <Link
                      to={getRedirectUrl(
                        `/customers/${referrals.redeemed[0].referral_code?.customer.id}`,
                        env
                      )}
                      className="flex items-center gap-1 truncate w-full"
                    >
                      <span className="truncate">
                        {referrals.redeemed[0].referral_code?.customer.name}
                      </span>
                      <div className="flex items-center justify-center">
                        <ArrowUpRightFromSquare
                          size={12}
                          className="text-t2 flex "
                        />
                      </div>
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent
                  className="px-2 font-mono flex flex-col gap-1"
                  align="end"
                  side="bottom"
                  sideOffset={5}
                >
                  <p>
                    {referrals.redeemed[0].referral_code?.customer.id}{" "}
                    {referrals.redeemed[0].referral_code.code}
                  </p>
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </SideAccordion>
    </div>
  );
};
