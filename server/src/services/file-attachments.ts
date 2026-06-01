import { inArray } from "drizzle-orm";
import { uploads } from "../db/schema";

const RIN_FILE_TITLE = "rin_file";
const DEFAULT_FILE_COUNT_LIMIT = 10;
const DEFAULT_FILE_TOTAL_SIZE_MB = 30;
const BYTES_PER_MB = 1024 * 1024;

type ConfigReader = {
    getOrDefault<T>(key: string, defaultValue: T): Promise<T>;
};

export type FileUploadLimits = {
    countLimit: number;
    totalSizeBytes: number;
};

export type FileAttachmentSummary = {
    urls: string[];
    count: number;
    totalSize: number;
};

export class FileAttachmentLimitError extends Error {
    status = 400;

    constructor(message: string) {
        super(message);
        this.name = "FileAttachmentLimitError";
    }
}

export async function getFileUploadLimits(serverConfig: ConfigReader): Promise<FileUploadLimits> {
    const countLimit = await getConfigNumber(serverConfig, "upload.file_count_limit", DEFAULT_FILE_COUNT_LIMIT);
    const totalSizeMb = await getConfigNumber(serverConfig, "upload.file_total_size_mb", DEFAULT_FILE_TOTAL_SIZE_MB);

    return {
        countLimit: Math.max(0, Math.floor(countLimit)),
        totalSizeBytes: Math.max(0, totalSizeMb) * BYTES_PER_MB,
    };
}

export function extractRinFileUrls(content: string) {
    const urls = new Set<string>();
    const linkPattern = /\[([^\]]*)\]\((\S+)(?:\s+"([^"]*)")?\)/g;

    for (const match of content.matchAll(linkPattern)) {
        const title = match[3]?.trim();
        if (title === RIN_FILE_TITLE) {
            urls.add(match[2]);
        }
    }

    return [...urls];
}

export async function summarizeFileAttachments(db: any, content: string): Promise<FileAttachmentSummary> {
    const urls = extractRinFileUrls(content);
    if (urls.length === 0) {
        return { urls, count: 0, totalSize: 0 };
    }

    const rows = await db.query.uploads.findMany({
        where: inArray(uploads.url, urls),
        columns: { url: true, size: true, kind: true, uid: true },
    });
    const rowByUrl = new Map(rows.map((row: any) => [row.url, row]));
    const unknown = urls.find((url) => !rowByUrl.has(url));
    if (unknown) {
        throw new FileAttachmentLimitError("Unknown file attachment");
    }

    const nonFile = rows.find((row: any) => row.kind !== "file");
    if (nonFile) {
        throw new FileAttachmentLimitError("Invalid file attachment");
    }

    const totalSize = rows.reduce((sum: number, row: any) => sum + Number(row.size || 0), 0);
    return { urls, count: urls.length, totalSize };
}

export async function summarizeOwnedFileAttachments(db: any, content: string, uid: number): Promise<FileAttachmentSummary> {
    const urls = extractRinFileUrls(content);
    if (urls.length === 0) {
        return { urls, count: 0, totalSize: 0 };
    }

    const rows = await db.query.uploads.findMany({
        where: inArray(uploads.url, urls),
        columns: { url: true, size: true, kind: true, uid: true },
    });
    const rowByUrl = new Map(rows.map((row: any) => [row.url, row]));
    const unknown = urls.find((url) => !rowByUrl.has(url));
    if (unknown) {
        throw new FileAttachmentLimitError("Unknown file attachment");
    }

    const nonFile = rows.find((row: any) => row.kind !== "file");
    if (nonFile) {
        throw new FileAttachmentLimitError("Invalid file attachment");
    }

    const ownedRows = rows.filter((row: any) => Number(row.uid) === uid);
    const ownedUrls = ownedRows.map((row: any) => String(row.url));
    const totalSize = ownedRows.reduce((sum: number, row: any) => sum + Number(row.size || 0), 0);
    return { urls: ownedUrls, count: ownedUrls.length, totalSize };
}

export async function enforceFileAttachmentLimits(
    db: any,
    serverConfig: ConfigReader,
    content: string,
    admin: boolean,
    uid: number,
    pendingFileSize = 0,
) {
    if (admin) {
        return;
    }

    const limits = await getFileUploadLimits(serverConfig);
    const summary = await summarizeOwnedFileAttachments(db, content, uid);
    const nextCount = summary.count + (pendingFileSize > 0 ? 1 : 0);
    const nextSize = summary.totalSize + Math.max(0, pendingFileSize);

    if (nextCount > limits.countLimit) {
        throw new FileAttachmentLimitError("File count limit exceeded");
    }
    if (nextSize > limits.totalSizeBytes) {
        throw new FileAttachmentLimitError("File size limit exceeded");
    }
}

async function getConfigNumber(serverConfig: ConfigReader, key: string, defaultValue: number) {
    const value = await serverConfig.getOrDefault<unknown>(key, defaultValue);
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return defaultValue;
}
