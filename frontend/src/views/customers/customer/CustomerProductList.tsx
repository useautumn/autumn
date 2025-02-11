import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatUnixToDateTime,
  formatUnixToDateTimeString,
} from "@/utils/formatUtils/formatDateUtils";
import { compareStatus, getBackendErr, navigateTo } from "@/utils/genUtils";
import { CusProduct, CusProductStatus } from "@autumn/shared";
import { useRouter } from "next/navigation";
import { useCustomerContext } from "./CustomerContext";
import { StatusBadge } from "../StatusBadge";
import {
  DropdownMenuItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsisVertical } from "@fortawesome/pro-regular-svg-icons";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import SmallSpinner from "@/components/general/SmallSpinner";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";

export const CustomerProductList = ({
  customer,
  products,
}: {
  customer: any;
  products: any;
}) => {
  const router = useRouter();
  const { env } = useCustomerContext();

  const sortedProducts = customer.products.sort((a: any, b: any) => {
    if (a.status !== b.status) {
      return compareStatus(a.status, b.status);
    }

    // return a.product.name.localeCompare(b.product.name);
    return b.created_at - a.created_at;
  });

  return (
    <div>
      <Table className="p-2">
        <TableHeader className="bg-transparent">
          <TableRow className="">
            <TableHead className="">Name</TableHead>
            <TableHead className="">Product ID</TableHead>
            <TableHead className=""></TableHead>
            <TableHead className="min-w-0 w-24">Created At</TableHead>
            {/* <TableHead className="">Ended At</TableHead> */}
            <TableHead className="min-w-0 w-6"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedProducts.map((cusProduct: CusProduct) => {
            return (
              <TableRow
                key={cusProduct.id}
                className="cursor-pointer"
                onClick={() => {
                  navigateTo(
                    `/customers/${customer.id}/${cusProduct.product_id}?id=${cusProduct.id}`,
                    router,
                    env
                  );
                }}
              >
                <TableCell>
                  {products.find((p) => p.id === cusProduct.product_id)?.name}
                  &nbsp;
                  {cusProduct.status === "expired" && (
                    <Badge variant="status" className="bg-stone-800">
                      expired
                    </Badge>
                  )}
                  {cusProduct.status === "past_due" && (
                    <Badge variant="status" className="bg-red-500">
                      past due
                    </Badge>
                  )}
                  {cusProduct.status === "scheduled" && (
                    <Badge variant="status" className="bg-blue-500">
                      scheduled
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-[100px] overflow-hidden text-ellipsis">
                  {cusProduct.product_id}
                </TableCell>
                <TableCell></TableCell>
                <TableCell>
                  <span>
                    {formatUnixToDateTime(cusProduct.created_at).date}
                  </span>{" "}
                  <span className="text-t3">
                    {formatUnixToDateTime(cusProduct.created_at).time}
                  </span>
                </TableCell>
                {/* <TableCell>
                  {cusProduct.ended_at
                    ? formatUnixToDateTimeString(cusProduct.ended_at)
                    : ""}
                </TableCell> */}
                <TableCell>
                  <EditCustomerProductToolbar cusProduct={cusProduct} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
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
        <Button variant="ghost" dim={6} className="rounded-full w-4 h-4 p-0">
          <FontAwesomeIcon
            icon={faEllipsisVertical}
            size="sm"
            className="h-3"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="text-t2">
        {/* Update status */}
        {[
          // CusProductStatus.Active,
          CusProductStatus.Expired,
          // CusProductStatus.PastDue,
        ].map((status) => (
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
          setLoading(false);
          toast.error(getBackendErr(error, "Failed to update status"));
        }
      }}
    >
      {keyToTitle(status)}
      {loading && <SmallSpinner />}
    </Button>
  );
};
