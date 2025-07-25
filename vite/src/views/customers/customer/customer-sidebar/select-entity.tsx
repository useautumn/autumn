import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Entity, Feature, FeatureUsageType } from "@autumn/shared";
import { useLocation, useNavigate } from "react-router";

import { CreateEntity } from "./create-entity/CreateEntity";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { useCustomerContext } from "../CustomerContext";

export const SelectEntity = ({
  entityId,
  entities,
}: {
  entityId?: string;

  entities: Entity[];
}) => {
  const cusContext = useCustomerContext();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  if (!entities || entities.length === 0) {
    // Only show create entity flow if there are continuous use features
    const hasContinuousUseFeatures = cusContext?.features?.some(
      (feature: Feature) =>
        feature.config?.usage_type === FeatureUsageType.Continuous
    );

    if (!hasContinuousUseFeatures) {
      return null;
    }

    // Create entity flow
    return (
      <>
        <CreateEntity open={open} setOpen={setOpen} />
        <Button
          className="h-6 px-2 text-t3 w-fit font-mono rounded-md justify-end"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          <PlusIcon size={13} />
          Create entity
        </Button>
      </>
    );
  }

  const entity = entities.find(
    (entity: Entity) => entity.id === entityId || entity.internal_id == entityId
  );

  return (
    <>
      <CreateEntity open={open} setOpen={setOpen} />
      <div className="col-span-6 flex justify-end h-6">
        <Select
          value={entityId}
          onValueChange={(value) => {
            if (value == "create-entity") {
              setOpen(true);
            } else {
              const params = new URLSearchParams(location.search);
              params.set("entity_id", value);
              navigate(`${location.pathname}?${params.toString()}`);
            }
          }}
        >
          <SelectTrigger
            className="h-6 px-2 pr-1 text-t2 w-fit font-mono rounded-md truncate justify-end min-w-[80px]"
            onClear={
              entityId
                ? () => {
                    const params = new URLSearchParams(location.search);
                    params.delete("entity_id");
                    navigate(`${location.pathname}?${params.toString()}`);
                  }
                : undefined
            }
          >
            <SelectValue placeholder="Select an entity">
              <span className="mr-2">
                {entityId ? (
                  <span className="text-t3 font-sans">
                    {entity?.name || entity?.id || entity?.internal_id}
                  </span>
                ) : (
                  <span className="text-t3 font-sans">Select an entity</span>
                )}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {entities.map((entity: Entity) => (
              <SelectItem
                key={entity.id}
                value={entity.id || entity.internal_id}
              >
                {entity.id || entity.internal_id}{" "}
                {entity.name ? (
                  <span className="text-t3 text-sm">({entity.name})</span>
                ) : (
                  ""
                )}
              </SelectItem>
            ))}
            {cusContext && (
              <SelectItem value="create-entity" className="text-t3">
                <PlusIcon size={13} className="text-t3" />
                Create entity
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
    </>
  );
};
