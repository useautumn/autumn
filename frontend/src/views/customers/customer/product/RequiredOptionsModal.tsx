import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

interface Option {
  feature_id: string;
  threshold?: number;
  quantity?: number;
}

interface OptionValue {
  feature_id: string;
  threshold?: number;
  quantity?: number;
}

export default function RequiredOptionsModal({
  requiredOptions,
  createProduct,
  setRequiredOptions,
}: {
  requiredOptions: Option[];
  createProduct: () => Promise<void>;
  setRequiredOptions: (options: Option[]) => void;
}) {
  const [requiredOptionsDialogOpen, setRequiredOptionsDialogOpen] =
    useState(false);

  const [loading, setLoading] = useState(false);

  const handleOptionChange = (featureId: string, value: string) => {
    const numValue = parseInt(value, 10);
    const newOptionValues = [...requiredOptions];
    const existingIndex = newOptionValues.findIndex(
      (o) => o.feature_id === featureId
    );
    const existingOption = newOptionValues[existingIndex];

    newOptionValues[existingIndex] = {
      ...existingOption,
      ...(existingOption.threshold !== undefined
        ? { threshold: numValue }
        : { quantity: numValue }),
    };

    setRequiredOptions(newOptionValues);
  };

  const handleContinue = async () => {
    setLoading(true);
    await createProduct();
    setLoading(false);
    setRequiredOptionsDialogOpen(false);
  };

  // Initialize optionValues when requiredOptions changes
  useEffect(() => {
    if (requiredOptions.length > 0) {
      setRequiredOptionsDialogOpen(true);
    }
  }, [requiredOptions]);

  return (
    <Dialog
      open={requiredOptionsDialogOpen}
      onOpenChange={() => {
        setRequiredOptionsDialogOpen(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inputs Required</DialogTitle>
          <DialogDescription>
            Please configure these required options before continuing
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {requiredOptions.map((option) => (
            <div key={option.feature_id} className="p-4 rounded-lg space-y-2">
              <h3 className="font-medium">{option.feature_id}</h3>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500">
                  {option.threshold !== undefined ? "Threshold" : "Quantity"}:
                </label>
                <input
                  type="number"
                  min="0"
                  value={
                    requiredOptions.find(
                      (o) => o.feature_id === option.feature_id
                    )?.[
                      option.threshold !== undefined ? "threshold" : "quantity"
                    ] || 0
                  }
                  onChange={(e) =>
                    handleOptionChange(option.feature_id, e.target.value)
                  }
                  className="border rounded px-2 py-1 w-24"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => setRequiredOptionsDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleContinue} isLoading={loading}>
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
