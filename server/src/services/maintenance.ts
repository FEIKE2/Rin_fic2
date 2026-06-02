import { MAINTENANCE_MESSAGE } from "@rin/config";

type ConfigReader = {
    getOrDefault<T>(key: string, defaultValue: T): Promise<T>;
};

export { MAINTENANCE_MESSAGE };

export function configValueToBoolean(value: unknown) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") return true;
        if (normalized === "false") return false;
    }
    return Boolean(value);
}

export async function isMaintenanceEnabled(config: ConfigReader, key: string) {
    return configValueToBoolean(await config.getOrDefault<unknown>(key, false));
}
