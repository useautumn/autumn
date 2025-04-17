import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { compareStatus, getBackendErr, navigateTo } from "@/utils/genUtils";
import { CusProduct, CusProductStatus, FullCusProduct } from "@autumn/shared";
import { useNavigate } from "react-router";
import { useCustomerContext } from "./CustomerContext";

import {
  DropdownMenuItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import SmallSpinner from "@/components/general/SmallSpinner";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import { Link } from "react-router";
import { getStripeSubLink } from "@/utils/linkUtils";
import React from "react";
import { ToolbarButton } from "@/components/general/table-components/ToolbarButton";
import { ArrowUpRightFromSquare } from "lucide-react";
import { AdminHover } from "@/components/general/AdminHover";
import AddProduct from "./add-product/NewProductDropdown";
import { Item, Row } from "@/components/general/TableGrid";
import { cn } from "@/lib/utils";

export const CustomerProductList = ({
  customer,
  products,
}: {
  customer: any;
  products: any;
}) => {
  const navigate = useNavigate();
  const { env, versionCounts } = useCustomerContext();
  const [showExpired, setShowExpired] = useState(false);

  const sortedProducts = customer.products
    .filter(
      (p: CusProduct) => showExpired || p.status !== CusProductStatus.Expired
    )
    .sort((a: any, b: any) => {
      if (a.status !== b.status) {
        return compareStatus(a.status, b.status);
      }

      return b.created_at - a.created_at;
    });

  return (
    <div>
      <div className="flex items-center grid grid-cols-10 gap-8 justify-between border-y bg-stone-100 pl-10 pr-7 h-10">
        <h2 className="text-sm text-t2 font-medium col-span-2 flex">
          Products
        </h2>
        <div className="flex w-full h-full items-center col-span-8 justify-end">
          <div className="flex w-fit h-full items-center gap-4">
            <Button
              variant="ghost"
              className={cn(
                "text-t3 text-xs font-normal p-0",
                showExpired && "text-t1 hover:text-t1"
              )}
              size="sm"
              onClick={() => setShowExpired(!showExpired)}
            >
              Show Expired
            </Button>
            {/* <CreateEntitlement buttonType={"feature"} /> */}
            <AddProduct />
          </div>
        </div>
      </div>
      {sortedProducts.length === 0 ? (
        <div className="flex pl-10 items-center h-10">
          <p className="text-t3">Attach a product to this customer</p>
        </div>
      ) : (
        <Row type="header" className="grid-cols-12 pr-0">
          <Item className="col-span-3">Name</Item>
          <Item className="col-span-3">Product ID</Item>
          <Item className="col-span-3">Status</Item>
          <Item className="col-span-2">Created At</Item>
          <Item className="col-span-1" />
        </Row>
      )}
      {sortedProducts.map((cusProduct: FullCusProduct) => {
        return (
          <Row
            key={cusProduct.id}
            className="grid-cols-12 pr-0"
            onClick={() => {
              navigateTo(
                `/customers/${customer.id || customer.internal_id}/${
                  cusProduct.product_id
                }?id=${cusProduct.id}`,
                navigate,
                env
              );
            }}
          >
            <Item className="col-span-3">
              <AdminHover
                texts={[
                  {
                    key: "Cus Product ID",
                    value: cusProduct.id,
                  },
                  {
                    key: "Stripe Subscription ID (1)",
                    value: cusProduct.subscription_ids?.[0] || "N/A",
                  },
                ]}
              >
                <div className="flex items-center gap-2">
                  <p>{cusProduct.product.name}</p>
                  {versionCounts[cusProduct.product.id] > 1 && (
                    <Badge
                      variant="outline"
                      className="text-xs bg-stone-50 text-t3 px-2 py-0 ml-2 font-mono"
                    >
                      v{cusProduct.product.version}
                    </Badge>
                  )}
                </div>
              </AdminHover>
            </Item>
            <Item className="col-span-3 text-t3 font-mono overflow-hidden text-ellipsis">
              {cusProduct.product_id}
            </Item>
            <Item className="col-span-3">
              <div className="flex gap-0.5 items-center">
                {cusProduct.status === "active" && (
                  <Badge variant="status" className="bg-lime-500 h-fit">
                    active
                  </Badge>
                )}
                {cusProduct.status === "expired" && (
                  <Badge variant="status" className="bg-stone-800 h-fit">
                    expired
                  </Badge>
                )}
                {cusProduct.status === "past_due" && (
                  <Badge variant="status" className="bg-red-500 h-fit">
                    past due
                  </Badge>
                )}
                {cusProduct.status === "scheduled" && (
                  <Badge variant="status" className="bg-blue-500 h-fit">
                    scheduled
                  </Badge>
                )}
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
              </div>
            </Item>
            <Item className="col-span-2 text-xs text-t3">
              {formatUnixToDateTime(cusProduct.created_at).date}{" "}
              {formatUnixToDateTime(cusProduct.created_at).time}
            </Item>
            <Item className="col-span-1 pr-4 flex items-center justify-center">
              <EditCustomerProductToolbar cusProduct={cusProduct} />
            </Item>
          </Row>
        );
      })}
    </div>
  );
};

const EditCustomerProductToolbar = ({
  cusProduct,
}: {
  cusProduct: CusProduct;
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <DropdownMenu open={dialogOpen} onOpenChange={setDialogOpen}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton className="!w-4 !h-6 !rounded-md text-t3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="text-t2">
        {/* Update status */}
        {[CusProductStatus.Expired].map((status) => (
          <DropdownMenuItem
            key={status}
            className="p-0"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <UpdateStatusDropdownBtn cusProduct={cusProduct} status={status} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const UpdateStatusDropdownBtn = ({
  cusProduct,
  status,
}: {
  cusProduct: CusProduct;
  status: CusProductStatus;
}) => {
  const [loading, setLoading] = useState(false);
  const { env, cusMutate } = useCustomerContext();
  const axiosInstance = useAxiosInstance({ env });

  return (
    <Button
      variant="ghost"
      dim={5}
      size="sm"
      className="p-2 h-full w-full flex justify-between"
      // isLoading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await CusService.updateCusProductStatus(
            axiosInstance,
            cusProduct.id,
            {
              status,
            }
          );
          await cusMutate();
        } catch (error) {
          toast.error(getBackendErr(error, "Failed to update status"));
        }
        setLoading(false);
      }}
    >
      {keyToTitle(status)}
      {loading && <SmallSpinner />}
    </Button>
  );
};
