import { DEFAULT_WEBGL_ENABLED, WEBGL_ENABLED_STORAGE_KEY } from "@/lib/constants";
import { createBooleanStoredSetting } from "@/utils/create-stored-setting";

const setting = createBooleanStoredSetting(WEBGL_ENABLED_STORAGE_KEY, DEFAULT_WEBGL_ENABLED);

export const loadStoredWebglEnabled = setting.load;
export const storeWebglEnabled = setting.store;
export const subscribeStoredWebglEnabled = setting.subscribe;
