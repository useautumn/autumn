import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { SelectContent } from "@/components/ui/select";
import { SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import React, { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import toast from "react-hot-toast";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { cn } from "@/lib/utils";
import { useHotkeys } from "react-hotkeys-hook";
import { PlusIcon, XIcon } from "lucide-react";

import { Expression, MeteredConfig } from "@autumn/shared";
import { FeatureType } from "@autumn/shared";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFeaturesContext } from "../FeaturesContext";

export function FeatureConfig({
  feature,
  setFeature,
}: {
  feature: any;
  setFeature: any;
}) {
  const { env, mutate } = useFeaturesContext();
  const axiosInstance = useAxiosInstance({ env });

  const [fields, setFields] = useState(
    feature.name
      ? {
          name: feature.name,
          id: feature.id,
        }
      : {
          name: "",
          id: "",
        }
  );
  const [meteredConfig, setMeteredConfig] = useState<MeteredConfig>(
    feature.type === FeatureType.Metered
      ? feature.config
      : {
          filters: [
            {
              property: "",
              operator: "",
              value: [],
            },
          ],
          aggregate: {
            type: "count",
            property: null,
          },
        }
  );
  const [idChanged, setIdChanged] = useState(false);
  const [featureType, setFeatureType] = useState<string>(
    feature.type ? feature.type : FeatureType.Boolean
  );

  useEffect(() => {
    setFeature({
      ...feature,
      name: fields.name,
      id: fields.id,
      type: featureType,
      config: meteredConfig,
    });
  }, [featureType, meteredConfig, fields]);

  // useEffect(() => {
  //   setFields({
  //     name: "",
  //     id: "",
  //   });
  //   setIdChanged(false);
  // }, []);

  const setAggregate = (key: string, value: string) => {
    setMeteredConfig({
      ...meteredConfig,
      aggregate: { ...meteredConfig.aggregate, [key]: value },
    });
  };

  // console.log(feature.type)

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        defaultValue={feature.type}
        className="w-[400px]"
        value={featureType}
        onValueChange={setFeatureType}
      >
        <TabsList>
          <TabsTrigger value={FeatureType.Boolean}>Boolean</TabsTrigger>
          <TabsTrigger value={FeatureType.Metered}>Metered</TabsTrigger>
        </TabsList>
      </Tabs>
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

      {/* Filter */}
      {featureType === FeatureType.Metered && (
        <>
          <div className="">
            <FieldLabel>Filter</FieldLabel>

            <div className="flex gap-1 mb-2 text-sm bor">
              <p className="text-t2 font-mono">event_name</p>
              <p className="text-sm text-t3">is one of</p>
            </div>
            <FilterInput config={meteredConfig} setConfig={setMeteredConfig} />
          </div>

          <div>
            <FieldLabel>Aggregate</FieldLabel>
            <Select
              value={meteredConfig.aggregate.type}
              onValueChange={(value) => setAggregate("type", value)}
              defaultValue="count"
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="count">COUNT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  );
}

export const FilterInput = ({
  config,
  setConfig,
}: {
  config: MeteredConfig;
  setConfig: any;
}) => {
  const [inputFocused, setInputFocused] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const filter: Expression = config.filters[0];

  const enterClicked = () => {
    const newFilter: Expression = { ...config.filters[0] };
    newFilter.value.push(inputValue);
    setConfig({ ...config, filters: [newFilter] });
    setInputValue("");
  };

  const onRemoveClicked = (index: number) => {
    const newFilter: Expression = { ...config.filters[0] };
    newFilter.value.splice(index, 1);
    setConfig({ ...config, filters: [newFilter] });
  };

  useHotkeys("enter", enterClicked, {
    enableOnFormTags: ["input"],
    enabled: inputFocused,
  });

  // useHotkeys(["meta+enter"], enterClicked, {
  //   enableOnContentEditable: true,
  //   enabled: inputFocused,
  // });

  return (
    <div
      className={cn(
        `p-2 py-2 h-fit rounded-md border text-sm w-full transition-colors duration-100 
        flex items-center flex-wrap gap-2 gap-y-2 bg-white`,
        inputFocused &&
          "border-primary shadow-[0_0_2px_1px_rgba(139,92,246,0.25)]"
      )}
    >
      {filter.value.map((value: string, index: number) => (
        <div
          key={index}
          className="flex items-center gap-2 border border-zinc-300 bg-zinc-50 rounded-full pl-3 pr-2 py-1 text-xs"
        >
          {value}
          <button
            className="text-zinc-500"
            onClick={() => onRemoveClicked(index)}
          >
            <XIcon size={15} />
          </button>
        </div>
      ))}
      <input
        className="outline-none w-[10px] flex-grow"
        placeholder="eg. api_request"
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
      ></input>
    </div>
  );
};
