import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FreeTrialDuration, FrontendFreeTrial } from "@autumn/shared";
import { useEffect } from "react";
import { useState } from "react";

export const FreeTrialConfig = ({
  freeTrial,
  setFreeTrial,
}: {
  freeTrial: FrontendFreeTrial;
  setFreeTrial: (freeTrial: FrontendFreeTrial) => void;
}) => {
  const [fields, setFields] = useState<FrontendFreeTrial>({
    length: freeTrial?.length || 7,
    unique_fingerprint: freeTrial?.unique_fingerprint || false,
  });

  useEffect(() => {
    setFreeTrial(fields);
  }, [fields, freeTrial, setFreeTrial]);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <FieldLabel>Length</FieldLabel>
        <Input
          value={fields.length}
          onChange={(e) => setFields({ ...fields, length: e.target.value })}
          type="number"
          endContent={<p className="text-t3">Days</p>}
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={fields.unique_fingerprint}
          onCheckedChange={(checked) =>
            setFields({ ...fields, unique_fingerprint: checked })
          }
        />
        <p className="">
          Only allow one per customer (based on `idempotency_key`)
        </p>
      </div>
    </div>
  );
};
