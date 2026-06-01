import { eq } from "drizzle-orm";
import type { DB } from "../core/hono-types";
import {
    cache,
    comments,
    feedEditHistory,
    feeds,
    friends,
    moments,
    uploads,
    users,
} from "../db/schema";

export interface DanglingUpload {
    id: number;
    storageKey: string;
    url: string;
    kind: string;
    originalName: string;
    size: number;
    username: string | null;
    danglingDays: number;
}

export interface DanglingResult {
    rows: DanglingUpload[];
    total: number;
    over7: number;
    truncated: boolean;
}

// 仅呈现悬空超过 24 小时的候选，避免误报「用户正在编辑、刚上传」的图片
const GRACE_HOURS = 24;
// 健康检查响应里最多内联的行数（超出在 summary/details 注明）
const MAX_ROWS = 200;
// 匹配由上传服务生成的 SHA-1 存储 key。URL 可能带 host、/api/blob/ 前缀、
// 自定义 S3_FOLDER，或 #blurhash 片段；收集时会同时加入各级路径后缀。
const STORAGE_KEY_RE = /(?:[A-Za-z0-9._-]+\/)*(?:files\/)?[a-f0-9]{40}(?:\.[A-Za-z0-9._-]+)?/gi;

function collectKeySuffixes(target: Set<string>, value: string) {
    const parts = value.split("/").filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
        target.add(parts.slice(i).join("/"));
    }
}

function collectKeys(target: Set<string>, value: unknown) {
    if (typeof value !== "string" || value.length === 0) return;
    const matches = value.match(STORAGE_KEY_RE);
    if (matches) {
        for (const match of matches) {
            collectKeySuffixes(target, match);
        }
    }
}

/**
 * 扫描所有可能引用上传文件的内容来源，找出登记表中「当前未被任何内容引用」且悬空超过 24h 的上传文件。
 * 纯只读，不做任何删除。
 */
export async function findDanglingUploads(db: DB): Promise<DanglingResult> {
    const [
        uploadRows,
        feedRows,
        momentRows,
        commentRows,
        historyRows,
        userRows,
        friendRows,
        configRows,
    ] = await Promise.all([
        db
            .select({
                id: uploads.id,
                storageKey: uploads.storageKey,
                url: uploads.url,
                kind: uploads.kind,
                originalName: uploads.originalName,
                size: uploads.size,
                createdAt: uploads.createdAt,
                username: users.username,
            })
            .from(uploads)
            .leftJoin(users, eq(uploads.uid, users.id)),
        db.select({ content: feeds.content, summary: feeds.summary, aiSummary: feeds.ai_summary }).from(feeds),
        db.select({ content: moments.content }).from(moments),
        db.select({ content: comments.content, replyToContent: comments.replyToContent }).from(comments),
        db
            .select({ content: feedEditHistory.content, summary: feedEditHistory.summary, title: feedEditHistory.title })
            .from(feedEditHistory),
        db.select({ avatar: users.avatar }).from(users),
        db.select({ avatar: friends.avatar }).from(friends),
        db.select({ value: cache.value }).from(cache).where(eq(cache.type, "client.config")),
    ]);

    // 构建「被引用 key」集合
    const referenced = new Set<string>();
    for (const row of feedRows) {
        collectKeys(referenced, row.content);
        collectKeys(referenced, row.summary);
        collectKeys(referenced, row.aiSummary);
    }
    for (const row of momentRows) collectKeys(referenced, row.content);
    for (const row of commentRows) {
        collectKeys(referenced, row.content);
        collectKeys(referenced, row.replyToContent);
    }
    for (const row of historyRows) {
        collectKeys(referenced, row.content);
        collectKeys(referenced, row.summary);
        collectKeys(referenced, row.title);
    }
    for (const row of userRows) collectKeys(referenced, row.avatar);
    for (const row of friendRows) collectKeys(referenced, row.avatar);
    for (const row of configRows) collectKeys(referenced, row.value);

    const now = Date.now();
    const candidates: DanglingUpload[] = [];
    for (const row of uploadRows) {
        if (referenced.has(row.storageKey)) continue;
        const createdMs = row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt) * 1000;
        const danglingHours = (now - createdMs) / 3_600_000;
        if (danglingHours <= GRACE_HOURS) continue;
        candidates.push({
            id: row.id,
            storageKey: row.storageKey,
            url: row.url,
            kind: row.kind,
            originalName: row.originalName,
            size: Number(row.size || 0),
            username: row.username ?? null,
            danglingDays: Math.floor(danglingHours / 24),
        });
    }

    candidates.sort((a, b) => b.danglingDays - a.danglingDays);

    const total = candidates.length;
    const over7 = candidates.filter((c) => c.danglingDays >= 7).length;
    const rows = candidates.slice(0, MAX_ROWS);

    return { rows, total, over7, truncated: total > MAX_ROWS };
}
