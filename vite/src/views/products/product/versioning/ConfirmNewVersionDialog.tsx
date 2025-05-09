import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTitle,
  DialogHeader,
  DialogContent,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useProductContext } from "../ProductContext";
import { toast } from "sonner";
import { useState } from "react";

export default function ConfirmNewVersionDialog({
  open,
  setOpen,
  createProduct,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  createProduct: () => Promise<void>;
}) {
  const { product, version } = useProductContext();
  let [confirmText, setConfirmText] = useState("");
  let [isLoading, setIsLoading] = useState(false);

  const onClick = async () => {
    if (confirmText !== product.id) {
      toast.error("Confirmation text is incorrect");
      return;
    }

    setIsLoading(true);
    await createProduct();
    setIsLoading(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* <Button>Confirm New Version</Button> */}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new version?</DialogTitle>
          <DialogDescription className="text-sm flex flex-col gap-4">
            <p>
              After creating a new version, it will be{" "}
              <span className="font-bold">
                active immediately for new customers
              </span>
              .<br /> You can migrate existing customers to the new version
              after.
            </p>
            <p>
              Type <code className="font-bold">{product.id}</code> to continue.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              type="text"
              placeholder={product.id}
              className="w-full text-black"
            />
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="gradientPrimary"
            onClick={onClick}
            isLoading={isLoading}
          >
            Create new version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
