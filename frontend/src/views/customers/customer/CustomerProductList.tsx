import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUnixToDateTimeString } from "@/utils/formatUtils/formatDateUtils";
import { CusProduct } from "@autumn/shared";
import { useRouter } from "next/navigation";

export const CustomerProductList = ({
  customer,
  products,
}: {
  customer: any;
  products: any;
}) => {
  const router = useRouter();

  return (
    <div>
      <Table className="p-2">
        <TableHeader className="bg-transparent">
          <TableRow className="">
            <TableHead className="w-[150px]">Name</TableHead>
            <TableHead className="">Product ID</TableHead>
            <TableHead className="">Status</TableHead>

            <TableHead className="">Created At</TableHead>
            <TableHead className="">Ended At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customer.products.map((cusProduct: CusProduct) => {
            return (
              <TableRow
                key={cusProduct.id}
                className="cursor-pointer"
                onClick={() => {
                  router.push(
                    `/customers/${customer.id}/${cusProduct.product_id}`
                  );
                }}
              >
                <TableCell>
                  {products.find((p) => p.id === cusProduct.product_id)?.name}
                </TableCell>
                <TableCell className="max-w-[100px] overflow-hidden text-ellipsis">
                  {cusProduct.product_id}
                </TableCell>
                <TableCell>{cusProduct.status}</TableCell>
                <TableCell>
                  {formatUnixToDateTimeString(cusProduct.created_at)}
                </TableCell>
                <TableCell>
                  {cusProduct.ended_at
                    ? formatUnixToDateTimeString(cusProduct.ended_at)
                    : ""}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
