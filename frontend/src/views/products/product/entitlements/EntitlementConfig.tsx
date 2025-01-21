import FieldLabel from "@/components/general/modal-components/FieldLabel";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Entitlement, Feature, FeatureType } from "@autumn/shared";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProductContext } from "@/views/products/product/ProductContext";
import { FeatureTypeBadge } from "@/views/features/FeatureTypeBadge";
import {
  AllowanceType,
  EntInterval,
  EntitlementWithFeature,
} from "@autumn/shared";

export const EntitlementConfig = ({
  entitlement,
  setEntitlement,
}: {
  entitlement: EntitlementWithFeature | Entitlement | null;
  setEntitlement: (entitlement: EntitlementWithFeature | null) => void;
}) => {
  const { features } = useProductContext();

  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(
    features?.find(
      (feature: Feature) =>
        feature.internal_id === entitlement?.internal_feature_id
    ) || null
  );

  const [fields, setFields] = useState({
    allowance_type: entitlement?.allowance_type || AllowanceType.Fixed,
    allowance: entitlement?.allowance || 0,
    interval: entitlement?.interval || EntInterval.Minute,
  });

  useEffect(() => {
    if (selectedFeature) {
      const boolFeature = selectedFeature.type === FeatureType.Boolean;
      const newEnt = {
        // For frontend
        feature: selectedFeature,

        // For backend
        id: entitlement?.id,
        internal_feature_id: selectedFeature.internal_id,
        feature_id: selectedFeature.id,

        ...fields,

        allowance_type: boolFeature ? undefined : fields.allowance_type,
        allowance: boolFeature ? undefined : fields.allowance,
        interval: boolFeature ? undefined : fields.interval,
      };

      setEntitlement(newEnt);
    } else {
      setEntitlement(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFeature, fields]);

  return (
    <div>
      <FieldLabel>Entitlement </FieldLabel>
      <Select
        value={selectedFeature?.internal_id}
        defaultValue={entitlement?.internal_feature_id}
        onValueChange={(value) =>
          setSelectedFeature(
            features?.find(
              (feature: Feature) => feature.internal_id === value
            ) || null
          )
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="Select a feature" />
        </SelectTrigger>
        <SelectContent>
          {features?.map((feature: Feature) => (
            <SelectItem key={feature.internal_id} value={feature.internal_id!}>
              <div className="flex gap-2 items-center">
                {feature.name}
                <FeatureTypeBadge type={feature.type} />
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedFeature && selectedFeature?.type != FeatureType.Boolean && (
        <div className="flex flex-col mt-4 text-sm">
          <FieldLabel>Allowance</FieldLabel>
          <Tabs
            defaultValue="fixed"
            className="mb-4"
            value={fields.allowance_type}
            onValueChange={(value) =>
              setFields({
                ...fields,
                allowance_type: value as AllowanceType,
              })
            }
          >
            <TabsList>
              <TabsTrigger value="fixed">Fixed</TabsTrigger>
              <TabsTrigger value="unlimited">Unlimited</TabsTrigger>
              <TabsTrigger value="none">None</TabsTrigger>
            </TabsList>
            <TabsContent value="fixed">
              <div className="flex gap-2 items-center mt-4">
                <Input
                  placeholder="eg. 100"
                  className="w-30"
                  value={fields.allowance}
                  onChange={(e) =>
                    setFields({
                      ...fields,
                      allowance: Number(e.target.value),
                    })
                  }
                />
                <p className="text-t3 min-w-fit">per</p>
                <Select
                  value={fields.interval}
                  onValueChange={(value) =>
                    setFields({
                      ...fields,
                      interval: value as EntInterval,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(EntInterval).map((interval) => (
                      <SelectItem key={interval} value={interval}>
                        {interval}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
    //     <DialogFooter>
    //       <Button onClick={handleCreateEntitlement} isLoading={loading}>
    //         Create
    //       </Button>
    //     </DialogFooter>
    //   </DialogContent>
    // </Dialog>
  );
};
