import { MAINTENANCE_CONFIG_KEYS } from "@rin/config";
import type { ConfigWrapper } from "../state/config";
import type { Profile } from "../state/profile";

export { MAINTENANCE_CONFIG_KEYS };

export function isMaintenanceBlocked(profile: Profile | null | undefined, config: ConfigWrapper, key: string) {
  return !profile?.permission && config.getBoolean(key);
}
