import { SideAccordion } from "@/components/general/SideAccordion";
import { SidebarLabel } from "@/components/general/sidebar/sidebar-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCustomerContext } from "../CustomerContext";
import { Entity, Feature } from "@autumn/shared";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { getFeatureName } from "@autumn/shared";

import CopyButton from "@/components/general/CopyButton";

export const CustomerEntities = () => {
  const { entityId, setEntityId, entities, features } = useCustomerContext();

  const entity = entities.find((entity: Entity) => entity.id === entityId);

  const feature = features.find(
    (feature: Feature) => entity?.internal_feature_id === feature.internal_id
  );

  const featureName = getFeatureName({
    feature,
    plural: false,
    capitalize: true,
  });
  if (!entity) {
    return null;
  }

  return (
    <div className="flex w-full border-b mt-[2.5px] p-4 ">
      <SideAccordion title="Entities" value="entities">
        <div className="grid grid-cols-8 auto-rows-[16px] gap-y-4 w-full items-center ">
          {/* <SelectEntity /> */}
          <SidebarLabel>ID</SidebarLabel>
          <div className="col-span-6 justify-end flex">
            <div className="w-full flex justify-end">
              <CopyButton text={entity?.id} className="">
                {entity?.id}
              </CopyButton>
            </div>
          </div>
          {entity && (
            <>
              <SidebarLabel>Name</SidebarLabel>
              <div className="col-span-6 flex justify-end">
                <span className="truncate">{entity?.name}</span>
              </div>
              <SidebarLabel>Feature</SidebarLabel>
              <div className="col-span-6 flex justify-end">
                {featureName.toLowerCase()}
              </div>
            </>
          )}
        </div>
      </SideAccordion>
    </div>
  );
};

export const SelectEntity = ({
  entityId,
  entities,
}: {
  entityId?: string;

  entities: Entity[];
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const entity = entities.find((entity: Entity) => entity.id === entityId);

  if (entities.length === 0) {
    return null;
  }

  return (
    <>
      <div className="col-span-6 flex justify-end h-6">
        <Select
          value={entityId}
          onValueChange={(value) => {
            const params = new URLSearchParams(location.search);
            params.set("entity_id", value);
            navigate(`${location.pathname}?${params.toString()}`);
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
                {entity?.id || (
                  <span className="text-t3 font-sans">Select an entity</span>
                )}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {entities.map((entity: Entity) => (
              <SelectItem key={entity.id} value={entity.id}>
                {entity.id}{" "}
                {entity.name ? (
                  <span className="text-t3 text-sm">({entity.name})</span>
                ) : (
                  ""
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
};
