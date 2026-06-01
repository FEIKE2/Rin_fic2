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
    storageKey: string;
    url: string;
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
// 匹配存储 key 的稳定子串：images/<sha1>.<ext>。
// URL 可能带 host 前缀或 #blurhash 片段、或为 /api/blob/... 回退形态，
// 该正则只截取 images/ 之后到下一个分隔符之前的部分，三种形态都能命中。
const STORAGE_KEY_RE = /images\/[A-Za-z0-9._-]+/g;

function collectKeys(target: Set<string>, value: unknown) {
    if (typeof value !== "string" || value.length === 0) return;
    const matches = value.match(STORAGE_KEY_RE);
    if (matches) {
        for (const match of matches) target.add(match);
    }
}

/**
 * 扫描所有可能引用图片的内容来源，找出登记表中「当前未被任何内容引用」且悬空超过 24h 的图片。
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
                storageKey: uploads.storageKey,
                url: uploads.url,
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
            storageKey: row.storageKey,
            url: row.url,
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
