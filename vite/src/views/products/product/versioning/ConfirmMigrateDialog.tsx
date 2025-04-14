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
  startMigration,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  startMigration: () => Promise<void>;
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
    await startMigration();
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
          <DialogTitle>Migrate customers?</DialogTitle>
          <DialogDescription className="text-sm flex flex-col gap-4">
            <p>
              Note: This will migrate all customers on {product.name} (version{" "}
              {version}) to the latest version.
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
            Start migration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
