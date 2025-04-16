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

export const ProductProps = () => {
  const { product, setProduct, counts } = useProductContext();
  const [defaultOpen, setDefaultOpen] = React.useState(false);
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
            bg-white/50 backdrop-blur-sm shadow-sm border-1 px-2 pr-6 py-2 text-t3 whitespace-nowrap
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
            <p className="text-xs text-t3 font-medium text-center">Default</p>
            <Popover open={defaultOpen} onOpenChange={setDefaultOpen}>
              <PopoverTrigger asChild className="p-0 py-0.5 h-fit">
                <Button variant="ghost" className="text-t2 px-2">
                  {product.is_default ? (
                    <span className="text-lime-600">True</span>
                  ) : (
                    "False"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-16 p-1" align="end">
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    className="text-t2 px-2 py-0"
                    onClick={() => {
                      setProduct({ ...product, is_default: true });
                      setDefaultOpen(false);
                    }}
                  >
                    True
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-t2 px-2 py-0"
                    onClick={() => {
                      setProduct({ ...product, is_default: false });
                      setDefaultOpen(false);
                    }}
                  >
                    False
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center w-full justify-between h-4">
            <p className="text-xs text-t3 font-medium text-center">Add On</p>
            <Popover open={addOnOpen} onOpenChange={setAddOnOpen}>
              <PopoverTrigger asChild className="p-0 py-0.5 h-fit">
                <Button variant="ghost" className="text-t2 px-2">
                  {product.is_add_on ? (
                    <span className="text-lime-600">True</span>
                  ) : (
                    "False"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-16 p-1" align="end">
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    className="text-t2 px-2 py-0"
                    onClick={() => {
                      setProduct({ ...product, is_add_on: true });
                      setAddOnOpen(false);
                    }}
                  >
                    True
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-t2 px-2 py-0"
                    onClick={() => {
                      setProduct({ ...product, is_add_on: false });
                      setAddOnOpen(false);
                    }}
                  >
                    False
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center w-full justify-between h-4">
            <p className="text-xs text-t3 font-medium text-center">Group</p>
            <Button
              variant="ghost"
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
            <DialogContent className="sm:min-w-sm">
              <DialogHeader>
                <DialogTitle>Edit Product Group</DialogTitle>
              </DialogHeader>
              <div className="flex gap-4 py-4">
                <Input
                  placeholder="Enter group name"
                  value={tempGroup}
                  onChange={(e) => setTempGroup(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setProduct({ ...product, group: tempGroup });
                      setGroupModalOpen(false);
                    }
                  }}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      setProduct({ ...product, group: tempGroup });
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
