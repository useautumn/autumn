import { useProductContext } from "./ProductContext";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import CopyButton from "@/components/general/CopyButton";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { ToggleDefaultProduct } from "./product-sidebar/ToggleDefaultProduct";

export const ProductProps = () => {
  const { product, setProduct, counts } = useProductContext();
  const [defaultOpen, setDefaultOpen] = React.useState(false);
  const [defaultTrialOpen, setDefaultTrialOpen] = React.useState(false);
  const [addOnOpen, setAddOnOpen] = React.useState(false);
  const [groupModalOpen, setGroupModalOpen] = React.useState(false);
  const [tempGroup, setTempGroup] = React.useState(product.group || "");

  return (
    <>
      <div className="flex justify-between gap-4 w-full whitespace-nowrap">
        <div className="flex flex-col w-full gap-4">
          <div className="flex items-center w-full justify-between gap-4 h-4">
            <p className="text-xs text-t3 font-medium text-center">
              Product ID
            </p>
            <CopyButton text={product.id} className="font-mono">
              <span className="truncate block">{product.id}</span>
            </CopyButton>
          </div>
          <div className="flex items-center w-full justify-between h-4">
            <p className="text-xs text-t3 font-medium text-center">Customers</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-sm text-t2 px-2">
                  {counts?.active ?? 0} active
                </p>
              </TooltipTrigger>
              <TooltipContent
                className="w-22 px-2 flex flex-col gap-2
            bg-white/50 backdrop-blur-sm shadow-sm border-1 pr-6 py-2 text-t3 whitespace-nowrap
            "
                side="bottom"
                sideOffset={4}
              >
                <p className="">
                  <span>Canceled:</span> {counts?.canceled}
                </p>
                {counts?.trialing > 0 && (
                  <p className="">
                    <span>Trialing:</span> {counts?.trialing}
                  </p>
                )}
                {counts?.custom > 0 && (
                  <p className="">
                    <span>Custom:</span> {counts?.custom}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center w-full justify-between h-4">
            <div className="flex items-center gap-2">
              <p className="text-xs text-t3 font-medium text-center">Default</p>
              <InfoTooltip>
                <p>
                  This product will be enabled by default for all new users,
                  typically used for your free plan
                </p>
              </InfoTooltip>
            </div>
            <ToggleDefaultProduct toggleKey="is_default" />
          </div>
          <div className="flex items-center w-full justify-between h-4">
            <div className="flex items-center gap-2">
              <p className="text-xs text-t3 font-medium text-center">Add On</p>
              <InfoTooltip>
                <p>
                  This product is an add-on that can be bought together with
                  your base products (eg, for top ups)
                </p>
              </InfoTooltip>
            </div>
            <ToggleDefaultProduct toggleKey="is_add_on" />
          </div>

          <div className="flex items-center w-full justify-between h-4">
            <p className="text-xs text-t3 font-medium text-center">Group</p>
            <Button
              variant="outline"
              className="text-t2 px-2 h-fit py-0.5"
              onClick={() => {
                setTempGroup(product.group || "");
                setGroupModalOpen(true);
              }}
            >
              {product.group || <span className="text-t3">No group</span>}
            </Button>
          </div>

          <Dialog open={groupModalOpen} onOpenChange={setGroupModalOpen}>
            <DialogContent className="sm:min-w-sm max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Product Group</DialogTitle>
              </DialogHeader>
              <p className="text-t3 text-sm">
                Assign this product to a group. Customers will be able to have
                active subscriptions from different product groups at the same
                time. This can alter your existing upgrade and downgrade logic,
                so read the docs{" "}
                <a
                  href="https://docs.useautumn.com/products/create-product#product-groups"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-500 underline"
                >
                  here
                </a>{" "}
                to understand how this works.
              </p>
              <div className="flex gap-4 py-4">
                <Input
                  placeholder="Enter group name"
                  value={tempGroup}
                  onChange={(e) => setTempGroup(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setProduct({
                        ...product,
                        group: tempGroup,
                      });
                      setGroupModalOpen(false);
                    }
                  }}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      setProduct({
                        ...product,
                        group: tempGroup,
                      });
                      setGroupModalOpen(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

        </div>
      </div>
    </>
  );
};
