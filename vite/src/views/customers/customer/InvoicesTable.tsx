import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { useCustomerContext } from "./CustomerContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { Invoice, Product } from "@autumn/shared";
import { toast } from "sonner";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { Row, Item } from "@/components/general/TableGrid";
import { AdminHover } from "@/components/general/AdminHover";
import { cn } from "@/lib/utils";
import { CusProductEntityItem } from "./components/CusProductEntityItem";
import { useCusQuery } from "./hooks/useCusQuery";

export const InvoicesTable = () => {
  // const { env, invoices, products, entityId, entities, showEntityView } =
  //   useCustomerContext();
  const { entityId, showEntityView } = useCustomerContext();
  const { customer, products, entities } = useCusQuery();
  const axiosInstance = useAxiosInstance();
  const invoices = customer.invoices;

  const entity = entities.find(
    (e: any) => e.id === entityId || e.internal_id === entityId
  );

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

  const invoicesFiltered = invoices.filter((invoice: Invoice) => {
    return entity ? invoice.internal_entity_id === entity.internal_id : true;
  });

  return (
    <div>
      <div className="items-center grid grid-cols-10 gap-8 justify-between border-y bg-stone-100 pl-10 h-10">
        <h2 className="text-sm text-t2 font-medium col-span-2 flex">
          Invoices
        </h2>
        <div className="flex w-full h-full items-center col-span-8 justify-end">
          {/* Add any header controls here if needed */}
        </div>
      </div>

      {invoicesFiltered.length === 0 ? (
        <div className="flex pl-10 items-center h-10">
          <p className="text-t3">No invoice history found</p>
        </div>
      ) : (
        <>
          <Row
            type="header"
            className={cn(
              "grid-cols-12 pr-0",
              showEntityView && "grid-cols-15"
            )}
          >
            <Item className="col-span-3">Products</Item>
            {showEntityView && <Item className="col-span-3">Entity</Item>}
            <Item className="col-span-3">Total</Item>
            <Item className="col-span-3">Status</Item>
            <Item className="col-span-2">Created At</Item>
            <Item className="col-span-1" />
          </Row>
        </>
      )}

      {invoicesFiltered.map((invoice: Invoice) => (
        <Row
          key={invoice.id}
          className={cn("grid-cols-12 pr-0", showEntityView && "grid-cols-15")}
          onClick={async () => {
            const stripeInvoice = await getStripeInvoice(invoice.stripe_id);
            if (!stripeInvoice.hosted_invoice_url) {
              const livemode = stripeInvoice.livemode;
              window.open(getStripeInvoiceLink(stripeInvoice), "_blank");
              return;
            }

            if (stripeInvoice && stripeInvoice.hosted_invoice_url) {
              window.open(stripeInvoice.hosted_invoice_url, "_blank");
            }
          }}
        >
          <Item className="col-span-3">
            <AdminHover
              texts={[
                { key: "ID", value: invoice.id },
                { key: "Stripe ID", value: invoice.stripe_id },
              ]}
            >
              {invoice.product_ids
                .map((p: string) => {
                  return products.find((product: any) => product.id === p)
                    ?.name;
                })
                .join(", ")}
            </AdminHover>
          </Item>
          {showEntityView && (
            <Item className="col-span-3 -translate-x-1">
              <CusProductEntityItem
                internalEntityId={invoice.internal_entity_id}
              />
            </Item>
          )}
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
          <Item className="col-span-2 text-xs text-t3">
            {formatUnixToDateTime(invoice.created_at).date}{" "}
            {formatUnixToDateTime(invoice.created_at).time}{" "}
          </Item>
          <Item className="col-span-1" />
        </Row>
      ))}
    </div>
  );
};
