import React from "react";
import CreateDBConnection from "./CreateDBConnection";
import { useFeaturesContext } from "../FeaturesContext";
import { DBConnection, Feature, FeatureType } from "@autumn/shared";

function MeteredView() {
  const { features, dbConns } = useFeaturesContext();

  const createMeteredFeature = () => {
    console.log("Create Metered Feature");
  };

  return (
    <div className="flex flex-col gap-2 w-fit text-sm">
      <p>DB Connections</p>

      {dbConns?.map((dbConn: DBConnection) => (
        <p key={dbConn.id}>- {dbConn.display_name}</p>
      ))}
      <p>Features</p>

      {features
        ?.filter((feature: Feature) => feature.type === FeatureType.Metered)
        .map((feature: Feature) => (
          <p key={feature.id}>- {feature.name}</p>
        ))}

      <CreateDBConnection />
    </div>
  );
}

export default MeteredView;
