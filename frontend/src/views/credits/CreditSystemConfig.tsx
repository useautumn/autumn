import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { CreditSystem, Feature, FeatureType } from "@autumn/shared";
import { faXmark } from "@fortawesome/pro-duotone-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
import { useCreditsContext } from "./CreditsContext";

function CreditSystemConfig({
  creditSystem,
  setCreditSystem,
}: {
  creditSystem: Feature;
  setCreditSystem: (creditSystem: Feature) => void;
}) {
  const { features } = useCreditsContext();
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
              feature_amount: 0,
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
      feature_amount: 0,
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
      type: FeatureType.Metered,
      config: creditSystemConfig,
    });
  }, [fields, creditSystemConfig]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 w-full">
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

      <div>
        {/* <FieldLabel>Schema</FieldLabel> */}
        <p className="text-sm text-t2 font-medium mb-2">Schema</p>
        <div className="grid grid-cols-12 gap-2 gap-y-1 mb-4">
          <FieldLabel className="!mb-0 col-span-5 flex items-end">
            Meter
          </FieldLabel>
          <FieldLabel className="!mb-0 col-span-3">Metered Amount</FieldLabel>
          <FieldLabel className="!mb-0 col-span-3">Credit Amount</FieldLabel>
          <p className="col-span-1"></p>

          {creditSystemConfig.schema.map((item, index) => (
            <React.Fragment key={index}>
              <Select
                onValueChange={(value) => {
                  handleSchemaChange(index, "metered_feature_id", value);
                }}
                value={item.metered_feature_id}
              >
                <SelectTrigger className="col-span-5">
                  <SelectValue placeholder="eg. API Calls" />
                </SelectTrigger>
                <SelectContent>
                  {features
                    ?.filter(
                      (feature: Feature) => feature.type === FeatureType.Metered
                    )
                    .map((feature: Feature) => (
                      <SelectItem key={feature.id} value={feature.id!}>
                        {feature.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              <Input
                className="col-span-3"
                type="number"
                value={item.feature_amount}
                onChange={(e) =>
                  handleSchemaChange(index, "feature_amount", e.target.value)
                }
              />
              <Input
                className="col-span-3"
                type="number"
                value={item.credit_amount}
                onChange={(e) =>
                  handleSchemaChange(index, "credit_amount", e.target.value)
                }
              />
              <div className="col-span-1 flex items-center justify-end">
                <Button
                  variant="ghost"
                  onClick={() => removeSchemaItem(index)}
                  isIcon
                  dim={6}
                  className="text-t3"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </Button>
              </div>
            </React.Fragment>
          ))}
        </div>

        <Button variant="secondary" onClick={addSchemaItem}>
          Add
        </Button>
      </div>
    </div>
  );
}

export default CreditSystemConfig;
