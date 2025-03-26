import { useEffect, useState } from "react";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { cn } from "@/lib/utils";
import { PlusIcon, XIcon } from "lucide-react";
import { Expression, MeteredConfig } from "@autumn/shared";
import { FeatureType } from "@autumn/shared";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Button } from "@/components/ui/button";
import { useHotkeys } from "react-hotkeys-hook";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectItem,
  SelectContent,
} from "@/components/ui/select";
import { useFeaturesContext } from "../FeaturesContext";

export function FeatureConfig({
  feature,
  setFeature,
  eventNameInput,
  setEventNameInput,
  isUpdate = false,
  eventNameChanged,
  setEventNameChanged,
}: {
  feature: any;
  setFeature: any;
  eventNameInput: string;
  setEventNameInput: any;
  isUpdate?: boolean;
  eventNameChanged: boolean;
  setEventNameChanged: any;
}) {
  const { features } = useFeaturesContext();
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
          // aggregate: {
          //   type: "count",
          //   property: null,
          // },
        }
  );

  const [groupByExists, setGroupByExists] = useState(
    feature.config.group_by ? true : false
  );

  const [idChanged, setIdChanged] = useState(!!feature.id);
  const [featureType, setFeatureType] = useState<string>(
    feature.type ? feature.type : FeatureType.Boolean
  );

  useEffect(() => {
    setFeature({
      ...feature,
      name: fields.name,
      id: isUpdate ? feature.id : fields.id,
      type: featureType,
      config: meteredConfig,
    });
  }, [featureType, meteredConfig, fields]);

  const setAggregate = (key: string, value: string) => {
    setMeteredConfig({
      ...meteredConfig,
      aggregate: { ...meteredConfig.aggregate, [key]: value },
    });
  };

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
      <div className="flex gap-2 w-full">
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

              if (!eventNameChanged) {
                setEventNameInput(slugify(e.target.value));
              }
            }}
          />
        </div>
        <div className="w-full">
          <FieldLabel>ID</FieldLabel>
          <Input
            disabled={isUpdate}
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
            <FieldLabel>Event Name</FieldLabel>

            {/* <div className="flex gap-1 mb-2 text-sm bor">
              <p className="text-t2 font-mono">event_name</p>
              <p className="text-sm text-t3">is one of</p>
            </div> */}
            <FilterInput
              config={meteredConfig}
              setConfig={setMeteredConfig}
              eventNameInput={eventNameInput}
              setEventNameInput={setEventNameInput}
              setEventNameChanged={setEventNameChanged}
            />
          </div>

          <div>
            {groupByExists ? (
              <div className="flex gap-2">
                <div className="w-full">
                  <FieldLabel>Group By</FieldLabel>
                  <Input
                    placeholder="eg. app_id"
                    value={meteredConfig.group_by?.property || ""}
                    onChange={(e) =>
                      setMeteredConfig({
                        ...meteredConfig,
                        group_by: {
                          ...meteredConfig.group_by,
                          property: e.target.value,
                          linked_feature_id:
                            meteredConfig.group_by?.linked_feature_id || null,
                        },
                      })
                    }
                  />
                </div>
                <div className="w-full">
                  <FieldLabel>Link to</FieldLabel>
                  <Select
                    value={meteredConfig.group_by?.linked_feature_id || ""}
                    onValueChange={(value) =>
                      setMeteredConfig({
                        ...meteredConfig,
                        group_by: {
                          property: meteredConfig.group_by?.property || "",
                          linked_feature_id: value || null,
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a feature" />
                    </SelectTrigger>
                    <SelectContent>
                      {features.map((feature: any) => (
                        <SelectItem key={feature.id} value={feature.id}>
                          {feature.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <Button
                className="h-7 border rounded-none text-t3 text-xs"
                variant="outline"
                startIcon={<PlusIcon size={12} />}
                onClick={() => {
                  setMeteredConfig({
                    ...meteredConfig,
                    group_by: {
                      property: "",
                      linked_feature_id: null,
                    },
                  });
                  setGroupByExists(true);
                }}
              >
                Group By
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export const FilterInput = ({
  config,
  setConfig,
  eventNameInput,
  setEventNameInput,
  setEventNameChanged,
}: {
  config: MeteredConfig;
  setConfig: any;
  eventNameInput: string;
  setEventNameInput: any;
  setEventNameChanged: any;
}) => {
  const [inputFocused, setInputFocused] = useState(false);

  const filter: Expression = config.filters[0];

  const enterClicked = () => {
    const newFilter: Expression = { ...config.filters[0] };
    newFilter.value.push(eventNameInput);
    setConfig({ ...config, filters: [newFilter] });
    setEventNameInput("");
    setEventNameChanged(true);
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
        placeholder="eg. chat-messages"
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        value={eventNameInput}
        onChange={(e) => {
          setEventNameInput(e.target.value);
          setEventNameChanged(true);
        }}
      ></input>
    </div>
  );
};
