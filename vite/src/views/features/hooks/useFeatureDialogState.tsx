import { useState } from "react";
import { getDefaultFeature } from "../utils/defaultFeature";

export const useFeatureDialogState = ({
  entityCreate,
}: {
  entityCreate?: boolean;
}) => {
  const [feature, setFeature] = useState(getDefaultFeature(entityCreate));
  const [eventNameInput, setEventNameInput] = useState("");
  const [eventNameChanged, setEventNameChanged] = useState(true);

  return {
    feature,
    setFeature,
    eventNameInput,
    setEventNameInput,
    eventNameChanged,
    setEventNameChanged,
  };
};
