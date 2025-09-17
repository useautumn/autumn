import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AttachBranch, AttachFunction } from "@autumn/shared";
import { ArrowUpRightFromSquare } from "lucide-react";
import { useState } from "react";

export const InvoiceCustomerButton = ({
  handleAttachClicked,
  preview,
  disabled,
  checkoutAllowed,
}: {
  handleAttachClicked: any;
  preview?: any;
  disabled?: boolean;
  checkoutAllowed?: boolean;
}) => {
  const [immediateLoading, setImmediateLoading] = useState(false);
  const [afterPaymentLoading, setAfterPaymentLoading] = useState(false);
  const buttonsDisabled = immediateLoading || afterPaymentLoading;

  const allowedBranches = [
    AttachBranch.New,
    AttachBranch.MainIsTrial,
    AttachBranch.MainIsFree,
    AttachBranch.OneOff,
    AttachBranch.AddOn,
  ];

  // const immediateDisabled = !allowedBranches.includes(preview?.branch);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="add"
          className="!h-full text-t2"
          endIcon={<ArrowUpRightFromSquare size={12} />}
          disableStartIcon={true}
          tabIndex={-1}
          tooltipContent="This will enable the product for the customer immediately, and redirect you to Stripe to finalize the invoice"
          disabled={disabled}
        >
          Invoice Customer
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-fit flex p-0">
        <div className="w-[300px]">
          <div className="border-r p-4 text-sm flex flex-col gap-2">
            <p>Enable Product Immediately</p>
            <p className="text-t2">
              This will enable the product for the customer immediately, and
              redirect you to Stripe to finalize the invoice
            </p>
            <Button
              isLoading={immediateLoading}
              className="w-fit mt-2"
              variant="outline"
              disabled={buttonsDisabled}
              onClick={() =>
                handleAttachClicked({
                  useInvoice: true,
                  enableProductImmediately: true,
                  setLoading: setImmediateLoading,
                })
              }
            >
              Invoice and enable immediately
            </Button>
          </div>
        </div>
        {(checkoutAllowed ||
          preview?.func == AttachFunction.CreateCheckout ||
          preview?.func == AttachFunction.AddProduct ||
          preview?.func == AttachFunction.OneOff) && (
          <div className="w-[300px]">
            <div className="p-4 text-sm flex flex-col gap-2">
              <p>Enable Product After Payment</p>
              <p className="text-t2">
                This will generate an invoice link for the customer, and enable
                the product after they pay the invoice
              </p>
              <Button
                isLoading={afterPaymentLoading}
                className="w-fit mt-2"
                variant="outline"
                disabled={buttonsDisabled}
                onClick={() =>
                  handleAttachClicked({
                    useInvoice: true,
                    enableProductImmediately: false,
                    setLoading: setAfterPaymentLoading,
                  })
                }
              >
                Invoice and enable after payment
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
