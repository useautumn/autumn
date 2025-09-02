import { SideAccordion } from "@/components/general/SideAccordion";
import { SidebarLabel } from "@/components/general/sidebar/sidebar-label";

import { Entity, Feature } from "@autumn/shared";

import { getFeatureName } from "@autumn/shared";

import CopyButton from "@/components/general/CopyButton";
import { useCusQuery } from "../../hooks/useCusQuery";
import { useCustomerContext } from "../../CustomerContext";

export const CustomerEntities = () => {
  const { customer, features } = useCusQuery();
  const { entityId } = useCustomerContext();

  const entities = customer.entities;

  const entity = entities.find(
    (entity: Entity) =>
      entity.id === entityId || entity.internal_id === entityId
  );

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
              {entity.id ? (
                <CopyButton text={entity?.id} className="">
                  {entity?.id}
                </CopyButton>
              ) : (
                <span className="px-1 text-t3">N/A</span>
              )}
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
