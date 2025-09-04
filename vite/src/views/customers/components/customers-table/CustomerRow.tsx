import CopyButton from "@/components/general/CopyButton";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { cn } from "@/lib/utils";
import { unixHasPassed } from "@/utils/dateUtils";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { pushPage } from "@/utils/genUtils";
import { getVersionCounts } from "@/utils/productUtils";
import {
  CusProductSchema,
  CusProductStatus,
  CustomerSchema,
  FullCusProduct,
  ProductSchema,
} from "@autumn/shared";
import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import {
  CustomerRowToolbar,
  CustomerRowToolbarItems,
} from "../CustomerRowToolbar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useContextMenu } from "@/components/general/table-components/ContextMenuWrapper";
import { DeleteCustomerDialog } from "../../customer/components/DeleteCustomer";
import { useCusSearchQuery } from "../../hooks/useCusSearchQuery";

const CustomerWithProductsSchema = CustomerSchema.extend({
  customer_products: z.array(
    CusProductSchema.extend({ product: ProductSchema })
  ),
});
type CustomerWithProducts = z.infer<typeof CustomerWithProductsSchema>;

const getCusProductsInfo = ({
  customer,
  versionCounts,
}: {
  customer: CustomerWithProducts;
  versionCounts: Record<string, number>;
}) => {
  if (!customer.customer_products || customer.customer_products.length === 0) {
    return <></>;
  }

  // Filter out expired products first
  const activeProducts = customer.customer_products.filter(
    (cusProduct) => cusProduct.status !== CusProductStatus.Expired
  );

  if (activeProducts.length === 0) {
    return <></>;
  }

  const getProductBadge = ({
    cusProduct,
    versionCounts,
  }: {
    cusProduct: FullCusProduct;
    versionCounts: Record<string, number>;
  }) => {
    const name = cusProduct.product.name;
    const status = cusProduct.status;

    const versionCount = versionCounts[cusProduct.product.id];
    const version = cusProduct.product.version;

    const prodName = (
      <>
        {name}
        {versionCount > 1 && (
          <>
            <Badge
              variant="outline"
              className="text-xs bg-stone-50 text-t3 px-2 ml-2 font-mono py-0"
            >
              v{version}
            </Badge>
          </>
        )}
      </>
    );

    if (status === CusProductStatus.PastDue) {
      return (
        <>
          <span>{prodName}</span>{" "}
          <Badge variant="status" className="bg-red-500">
            Past Due
          </Badge>
        </>
      );
    } else {
      if (cusProduct.canceled_at) {
        return (
          <>
            <span>{prodName}</span>{" "}
            <Badge variant="status" className="bg-yellow-500">
              Canceled
            </Badge>
          </>
        );
      } else if (
        cusProduct.trial_ends_at &&
        !unixHasPassed(cusProduct.trial_ends_at)
      ) {
        return (
          <>
            <span>{prodName}</span>{" "}
            <Badge variant="status" className="bg-lime-500">
              Trial
            </Badge>
          </>
        );
      } else {
        return (
          <>
            <span>{prodName}</span>
          </>
        );
      }
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {activeProducts.slice(0, 1).map((cusProduct: any, index: number) => (
          <div key={index}>
            {getProductBadge({ cusProduct, versionCounts })}
            {activeProducts.length > 1 && (
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger>
                    <Badge
                      variant="status"
                      className="ml-1 bg-stone-100 text-primary"
                    >
                      +{activeProducts.length - 1}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {activeProducts
                      .slice(1)
                      .map((p: any) => p.product.name)
                      .join(", ")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        ))}
      </div>
    </>
  );
};

export const CustomerRow = ({
  customer,
  index,
}: {
  customer: CustomerWithProducts;
  index: number;
}) => {
  const { products } = useProductsQuery();
  const navigate = useNavigate();

  const versionCounts = getVersionCounts(products);

  const [openKeyId, setOpenKeyId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleRowClick = () => {
    navigate(
      pushPage({
        path: `/customers/${customer.id || customer.internal_id}`,
      })
    );
  };

  return (
    <ContextMenu
      key={customer.id || customer.internal_id}
      onOpenChange={(open) =>
        setOpenKeyId(open ? customer.id || customer.internal_id : null)
      }
    >
      <ContextMenuTrigger>
        <Link
          to={pushPage({
            path: `/customers/${customer.id || customer.internal_id}`,
          })}
          className={cn(
            "grid grid-cols-17 gap-2 items-center px-10 w-full text-sm h-8 cursor-default hover:bg-table-hover text-t2 whitespace-nowrap",
            (customer.id == null
              ? openKeyId === customer.internal_id
              : openKeyId === customer.id) && "bg-table-hover"
          )}
        >
          {/* <div
          onClick={handleRowClick}
          className={cn(
            "grid grid-cols-17 gap-2 items-center px-10 w-full text-sm h-8 cursor-pointer hover:bg-table-hover text-t2 whitespace-nowrap",
            openKeyId === (customer.id || customer.internal_id) &&
              "bg-table-hover"
          )}
        > */}
          <DeleteCustomerDialog
            customer={customer}
            open={deleteOpen}
            setOpen={setDeleteOpen}
          />
          <CustomTableCell colSpan={3}>{customer.name}</CustomTableCell>
          <CustomTableCell className="font-mono -translate-x-1" colSpan={3}>
            {customer.id ? (
              <CopyButton
                text={customer.id || ""}
                className="bg-transparent text-t3 border-none px-1 shadow-none max-w-full"
              >
                <span className="truncate">{customer.id}</span>
              </CopyButton>
            ) : (
              <span className="px-1 text-t3">NULL</span>
            )}
          </CustomTableCell>
          <CustomTableCell colSpan={3}>{customer.email}</CustomTableCell>
          <CustomTableCell colSpan={5}>
            {getCusProductsInfo({ customer, versionCounts })}
          </CustomTableCell>
          <CustomTableCell colSpan={2} className="text-t3 text-xs ">
            {formatUnixToDateTime(customer.created_at).date}
            <span className="text-t3">
              {" "}
              {formatUnixToDateTime(customer.created_at).time}{" "}
            </span>
          </CustomTableCell>
          <CustomTableCell
            colSpan={1}
            className="text-t3 text-xs flex justify-end"
          >
            <CustomerRowToolbar
              customer={customer}
              setDeleteOpen={setDeleteOpen}
            />
          </CustomTableCell>
        </Link>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <CustomerRowToolbarItems
          setDeleteOpen={setDeleteOpen}
          isContextMenu={true}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const CustomTableCell = ({
  children,
  className,
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) => {
  return (
    <div
      className={cn(
        colSpan ? `col-span-${colSpan}` : "col-span-3",
        "overflow-hidden text-ellipsis pr-1",
        className
      )}
    >
      {children}
    </div>
  );
};
