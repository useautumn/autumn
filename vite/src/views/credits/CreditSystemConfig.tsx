import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import {
  CreateFeature,
  CreditSchemaItem,
  Feature,
  FeatureType,
} from "@autumn/shared";

import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useFeaturesContext } from "../features/FeaturesContext";
import { X } from "lucide-react";

function CreditSystemConfig({
  creditSystem,
  setCreditSystem,
}: {
  creditSystem: CreateFeature;
  setCreditSystem: (creditSystem: CreateFeature) => void;
}) {
  const { features } = useFeaturesContext();
  const [fields, setFields] = useState<any>(
    creditSystem.name
      ? {
          name: creditSystem.name,
          id: creditSystem.id,
        }
      : {
          name: "",
          id: "",
        }
  );
  const [idChanged, setIdChanged] = useState(creditSystem.name !== "");
  const [creditSystemConfig, setCreditSystemConfig] = useState<any>(
    creditSystem.type === FeatureType.CreditSystem
      ? creditSystem.config
      : {
          schema: [
            {
              metered_feature_id: "",
              feature_amount: 1,
              credit_amount: 0,
            },
          ],
        }
  );

  const handleSchemaChange = (index: number, key: string, value: any) => {
    const newSchema = [...creditSystemConfig.schema];
    newSchema[index][key] = value;
    setCreditSystemConfig({ ...creditSystemConfig, schema: newSchema });
  };

  const addSchemaItem = () => {
    const newSchema = [...creditSystemConfig.schema];
    newSchema.push({
      metered_feature_id: "",
      feature_amount: 1,
      credit_amount: 0,
    });

    setCreditSystemConfig({ ...creditSystemConfig, schema: newSchema });
  };

  const removeSchemaItem = (index: number) => {
    const newSchema = [...creditSystemConfig.schema];
    newSchema.splice(index, 1);
    setCreditSystemConfig({ ...creditSystemConfig, schema: newSchema });
  };

  useEffect(() => {
    setCreditSystem({
      ...creditSystem,
      name: fields.name,
      id: fields.id,
      type: FeatureType.CreditSystem,
      config: creditSystemConfig,
    });
  }, [fields, creditSystemConfig]);

  return (
    <div className="flex flex-col gap-4 overflow-visible">
      <div className="flex gap-2 w-full overflow-visible">
        <div className="w-full">
          <FieldLabel>Name</FieldLabel>
          <Input
            placeholder="Name"
            value={fields.name}
            onChange={(e) => {
              const newFields: any = { ...fields, name: e.target.value };
              if (!idChanged) {
                newFields.id = slugify(e.target.value);
              }
              setFields(newFields);
            }}
          />
        </div>
        <div className="w-full">
          <FieldLabel>ID</FieldLabel>
          <Input
            placeholder="ID"
            value={fields.id}
            onChange={(e) => {
              setFields({ ...fields, id: e.target.value });
              setIdChanged(true);
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 overflow-visible">
        <div className="flex flex-col w-full">
          <div className="flex w-full gap-2">
            <FieldLabel className="w-full">Metered Feature</FieldLabel>
            <FieldLabel className="w-full">Credit Amount</FieldLabel>
          </div>

          <div className="flex flex-col w-full gap-2 overflow-visible">
            {creditSystemConfig.schema.map((item: any, index: number) => (
              <div key={index} className="flex w-full gap-2">
                <div className="flex w-full gap-2 ">
                  <div className="w-1/2">
                    <Select
                      onValueChange={(value) => {
                        handleSchemaChange(index, "metered_feature_id", value);
                      }}
                      value={item.metered_feature_id}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue className="truncate" />
                      </SelectTrigger>
                      <SelectContent>
                        {features
                          ?.filter(
                            (feature: Feature) =>
                              feature.type === FeatureType.Metered &&
                              !creditSystemConfig.schema.some(
                                (schemaItem: CreditSchemaItem) =>
                                  feature.id != item.metered_feature_id &&
                                  schemaItem.metered_feature_id === feature.id
                              )
                          )
                          .map((feature: Feature) => (
                            <SelectItem
                              key={feature.id}
                              value={feature.id!}
                              className="w-full"
                            >
                              <span className="truncate">{feature.name}</span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex w-1/2 gap-1">
                    <Input
                      className="w-full"
                      type="number"
                      value={item.credit_amount}
                      onChange={(e) =>
                        handleSchemaChange(
                          index,
                          "credit_amount",
                          e.target.value
                        )
                      }
                    />
                    <div className="flex items-center justify-end">
                      <Button
                        variant="ghost"
                        onClick={() => removeSchemaItem(index)}
                        isIcon
                        dim={5}
                        className="text-t3"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Button
          variant="secondary"
          className="w-fit"
          onClick={addSchemaItem}
          disabled={
            creditSystemConfig.schema.length ==
            features.filter(
              (feature: Feature) => feature.type === FeatureType.Metered
            ).length
          }
        >
          Add
        </Button>
      </div>
    </div>
  );
}

export default CreditSystemConfig;
