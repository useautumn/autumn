import { useState } from "react";
import { loadSettings, type PlaygroundSettings, saveSettings } from "../settings";

export const useSettings = () => {
  const [settings, setSettings] = useState(loadSettings);
  const updateSettings = (patch: Partial<PlaygroundSettings>) => {
    const next = { ...settings, ...patch };
    saveSettings({ settings: next });
    setSettings(next);
  };
  return { settings, updateSettings };
};
