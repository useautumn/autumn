import { SideAccordion } from "@/components/general/SideAccordion";
import { getRedirectUrl } from "@/utils/genUtils";
import { Dialog } from "@/components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ArrowUpRightFromSquare } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import AddCouponDialogContent from "../add-coupon/AddCouponDialogContent";
import { useCustomerContext } from "../CustomerContext";

export const CustomerRewards = () => {
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
                        className="flex justify-between hover:bg-primary/5 items-center"
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
                          className="flex justify-between hover:bg-primary/5 items-center"
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
