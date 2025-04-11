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
import { AppEnv, Invoice, Product } from "@autumn/shared";
import { toast } from "sonner";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { Row, Item } from "@/components/general/TableGrid";

export const InvoicesTable = () => {
  const { env, invoices, products } = useCustomerContext();
  const axiosInstance = useAxiosInstance({ env });
  const getStripeInvoice = async (stripeInvoiceId: string) => {
    try {
      const { data } = await axiosInstance.get(
        `/v1/invoices/${stripeInvoiceId}/stripe`
      );
      return data;
    } catch (error) {
      toast.error("Failed to get invoice URL");
      return null;
    }
  };

  const getTotalDiscountAmount = (invoice: Invoice) => {
    return invoice.discounts.reduce((acc: number, discount: any) => {
      return acc + discount.amount_used;
    }, 0);
  };

  return (
    <div>
      <div className="flex items-center grid grid-cols-10 gap-8 justify-between border-y bg-stone-100 pl-10 h-10">
        <h2 className="text-sm text-t2 font-medium col-span-2 flex">
          Invoices
        </h2>
        <div className="flex w-full h-full items-center col-span-8 justify-end">
          {/* Add any header controls here if needed */}
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="flex pl-10 items-center h-10">
          <p className="text-t3 text-xs">No invoice history found</p>
        </div>
      ) : (
        <>
          <Row type="header" className="grid-cols-13">
            <Item className="col-span-3">Products</Item>
            <Item className="col-span-3">Total</Item>
            <Item className="col-span-3">Status</Item>
            <Item className="col-span-3">Created At</Item>
            <Item className="col-span-1" />
          </Row>
        </>
      )}

      {invoices.map((invoice: Invoice) => (
        <Row
          key={invoice.id}
          className="grid-cols-13"
          onClick={async () => {
            const stripeInvoice = await getStripeInvoice(invoice.stripe_id);
            if (!stripeInvoice.hosted_invoice_url) {
              let livemode = stripeInvoice.livemode;
              window.open(getStripeInvoiceLink(stripeInvoice), "_blank");
              return;
            }

            if (stripeInvoice && stripeInvoice.hosted_invoice_url) {
              window.open(stripeInvoice.hosted_invoice_url, "_blank");
            }
          }}
        >
          <Item className="col-span-3">
            {invoice.product_ids
              .map((p: string) => {
                return products.find((product: Product) => product.id === p)
                  ?.name;
              })
              .join(", ")}
          </Item>
          <Item className="col-span-3">
            {invoice.total.toFixed(2)} {invoice.currency.toUpperCase()}
            {getTotalDiscountAmount(invoice) > 0 && (
              <span className="text-t3">
                {" "}
                (-{getTotalDiscountAmount(invoice).toFixed(2)})
              </span>
            )}
          </Item>
          <Item className="col-span-3">{invoice.status}</Item>
          <Item className="col-span-3 text-xs">
            {formatUnixToDateTime(invoice.created_at).date}
            <span className="text-t3 ">
              {" "}
              {formatUnixToDateTime(invoice.created_at).time}{" "}
            </span>
          </Item>
          <Item className="col-span-1" />
        </Row>
      ))}
    </div>
  );
};
