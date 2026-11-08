import * as React from "react";
import { defaultSettings, type Settings } from "@/data/settings";

/** Read-only settings for deeply nested components (e.g. code visibility). */
export const SettingsContext = React.createContext<Settings>(defaultSettings);

export const useSettings = () => React.useContext(SettingsContext);
