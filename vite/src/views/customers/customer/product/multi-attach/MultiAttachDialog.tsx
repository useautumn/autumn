import {
  CustomDialogBody,
  CustomDialogContent,
  CustomDialogFooter,
} from "@/components/general/modal-components/DialogContentWrapper";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MainDialogBodyWrapper } from "@/views/products/product/product-item/product-item-config/AdvancedConfigSidebar";
import { InvoiceCustomerButton } from "../components/InvoiceCustomerButton";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Minus, Plus, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCustomerContext } from "../../CustomerContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { FullProduct } from "@autumn/shared";
import { Input } from "@/components/ui/input";
import { formatAmount } from "@/utils/formatUtils/formatTextUtils";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const MultiAttachDialog = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) => {
  const { customer, cusMutate, products, org } = useCustomerContext();

  const axiosInstance = useAxiosInstance();

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [productOptions, setProductOptions] = useState<any[]>([
    { product_id: null, quantity: 1 },
  ]);

  const defaultCurrency = org?.default_currency || "usd";

  const handleAttachClicked = async ({
    // enableProductImmediately,
    useInvoice,
    setLoading,
  }: {
    // enableProductImmediately: false;
    useInvoice: boolean;
    setLoading: (loading: boolean) => void;
  }) => {
    console.log(productOptions);
    for (const option of productOptions) {
      if (!option.product_id) {
        toast.error("Can't leave product empty");
        return;
      }
    }

    setLoading(true);

    try {
      await axiosInstance.post("/v1/attach", {
        customer_id: customer.id,
        products: productOptions,
        invoice: useInvoice,
        enable_product_immediately: useInvoice ? true : undefined,
      });
      await cusMutate();
      toast.success("Products attached successfully");
      setOpen(false);
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to attach products"));
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <CustomDialogContent className="w-lg">
        <CustomDialogBody>
          <div className="flex flex-col gap-4">
            <DialogHeader className="p-0">
              <DialogTitle>Attach Products</DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-10 gap-2">
              <FieldLabel className="col-span-7 mb-0">Products</FieldLabel>
              <FieldLabel className="col-span-3 mb-0">Quantity</FieldLabel>

              {productOptions.map((option, index) => (
                <>
                  <Select
                    onValueChange={(value) => {
                      setProductOptions((prev) => {
                        const newOptions = [...prev];
                        newOptions[index] = {
                          product_id: value,
                          quantity: newOptions[index].quantity,
                        };
                        return newOptions;
                      });
                    }}
                  >
                    <SelectTrigger className="col-span-7">
                      <SelectValue placeholder="Select Product" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] overflow-y-auto">
                      {products
                        .filter(
                          (p: FullProduct) =>
                            !productOptions
                              .map((o, i) => (i !== index ? o.product : null))
                              .includes(p.id)
                        )
                        .map((product: FullProduct) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <div className="col-span-3 flex items-center gap-1">
                    <Input
                      type="number"
                      className="w-full"
                      value={option.quantity}
                      onChange={(e) => {
                        setProductOptions((prev) => {
                          const newOptions = [...prev];
                          newOptions[index] = {
                            product_id: newOptions[index].product_id,
                            quantity: parseInt(e.target.value),
                          };
                          return newOptions;
                        });
                      }}
                    />
                    <Button
                      size="sm"
                      className="w-6 !h-6 text-t3"
                      isIcon
                      variant="ghost"
                      startIcon={<X size={12} />}
                      onClick={() => {
                        setProductOptions((prev) => {
                          const newOptions = [...prev];
                          newOptions.splice(index, 1);
                          return newOptions;
                        });
                      }}
                    />
                  </div>
                </>
              ))}
            </div>

            <Button
              size="sm"
              className="w-fit"
              variant="secondary"
              startIcon={<Plus size={12} />}
              onClick={() => {
                setProductOptions((prev) => [
                  ...prev,
                  { product_id: null, quantity: 1 },
                ]);
              }}
            >
              New Product
            </Button>
            <div>
              <FieldLabel>Price</FieldLabel>
              <div className="flex items-center gap-2 text-sm text-t2">
                <p>Total:</p>
                <p>
                  {formatAmount({
                    amount: 0,
                    currency: defaultCurrency,
                  })}
                </p>
              </div>
            </div>
          </div>
        </CustomDialogBody>

        <CustomDialogFooter>
          <InvoiceCustomerButton handleAttachClicked={handleAttachClicked} />
          <Button
            variant="add"
            onClick={async () => {
              try {
                const { data } = await axiosInstance.post("/v1/checkout", {
                  customer_id: customer.id,
                  products: productOptions,
                  invoice: false,
                  enable_product_immediately: false,
                });
                console.log(data);
              } catch (error) {
                toast.error(getBackendErr(error, "Failed to preview checkout"));
              }
            }}
            isLoading={checkoutLoading}
          >
            Test Preview
          </Button>
          <Button
            variant="add"
            onClick={() => {
              handleAttachClicked({
                useInvoice: false,
                setLoading: setCheckoutLoading,
              });
            }}
            isLoading={checkoutLoading}
          >
            Checkout Page
          </Button>
        </CustomDialogFooter>
      </CustomDialogContent>
    </Dialog>
  );
};

{
  /* <div className="grid grid-cols-10 gap-2">
              <FieldLabel className="col-span-7 mb-0">Products</FieldLabel>
              <FieldLabel className="col-span-3 mb-0">Quantity</FieldLabel>

              {productOptions.map((option, index) => (
                <>
                  <Select
                    onValueChange={(value) => {
                      setProductOptions((prev) => {
                        const newOptions = [...prev];
                        newOptions[index] = {
                          product_id: value,
                          quantity: newOptions[index].quantity,
                        };
                        return newOptions;
                      });
                    }}
                  >
                    <SelectTrigger className="col-span-7">
                      <SelectValue placeholder="Select Product" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] overflow-y-auto">
                      {products
                        .filter(
                          (p: FullProduct) =>
                            !productOptions
                              .map((o, i) => (i !== index ? o.product : null))
                              .includes(p.id)
                        )
                        .map((product: FullProduct) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <div className="col-span-3 flex items-center gap-1">
                    <Input
                      type="number"
                      className="w-full"
                      value={option.quantity}
                      onChange={(e) => {
                        setProductOptions((prev) => {
                          const newOptions = [...prev];
                          newOptions[index] = {
                            product_id: newOptions[index].product_id,
                            quantity: parseInt(e.target.value),
                          };
                          return newOptions;
                        });
                      }}
                    />
                    <Button
                      size="sm"
                      className="w-6 !h-6 text-t3"
                      isIcon
                      variant="ghost"
                      startIcon={<X size={12} />}
                      onClick={() => {
                        setProductOptions((prev) => {
                          const newOptions = [...prev];
                          newOptions.splice(index, 1);
                          return newOptions;
                        });
                      }}
                    />
                  </div>
                </>
              ))}
            </div> */
}
