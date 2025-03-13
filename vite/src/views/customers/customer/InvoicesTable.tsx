import { TableHead } from "@/components/ui/table";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import {
  Table,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { useCustomerContext } from "./CustomerContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { navigateTo } from "@/utils/genUtils";
import { Invoice, Product } from "@autumn/shared";
import { toast } from "sonner";

export const InvoicesTable = () => {
  const { env, invoices, products } = useCustomerContext();
  const axiosInstance = useAxiosInstance({ env });
  const getInvoice = async (invoiceId: string) => {
    try {
      const { data } = await axiosInstance.get(`/v1/invoices/${invoiceId}`);
      return data;
    } catch (error) {
      toast.error("Failed to get invoice URL");
      return null;
    }
  };

  // const getTotalDiscountAmount = (invoice: Invoice) => {
  //   return invoice.discounts.reduce((acc: number, discount: any) => {
  //     return acc + discount.amount_used;
  //   }, 0);
  // };

  return (
    <Table className="p-2">
      <TableHeader>
        <TableRow className="bg-white">
          <TableHead className="">Products</TableHead>
          <TableHead className="">Total</TableHead>
          <TableHead className="">Status</TableHead>
          <TableHead className="min-w-0 w-28">Created At</TableHead>
          <TableHead className="min-w-0 w-6"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice: Invoice) => (
          <TableRow
            key={invoice.id}
            onClick={async () => {
              const latestInvoice = await getInvoice(invoice.id);
              if (latestInvoice) {
                window.open(latestInvoice.hosted_invoice_url, "_blank");
              }
            }}
            className="cursor-pointer"
          >
            <TableCell>
              {invoice.product_ids
                .map((p: string) => {
                  return products.find((product: Product) => product.id === p)
                    ?.name;
                })
                .join(", ")}
            </TableCell>

            {/* <TableCell>
              {invoice.total.toFixed(2)} {invoice.currency.toUpperCase()}
              {getTotalDiscountAmount(invoice) > 0 && (
                <span className="text-t3">
                  {" "}
                  (-{getTotalDiscountAmount(invoice).toFixed(2)})
                </span>
              )}
            </TableCell> */}
            <TableCell>{invoice.status}</TableCell>
            <TableCell>
              {formatUnixToDateTime(invoice.created_at).date}
              <span className="text-t3">
                {" "}
                {formatUnixToDateTime(invoice.created_at).time}{" "}
              </span>
            </TableCell>
            <TableCell></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
