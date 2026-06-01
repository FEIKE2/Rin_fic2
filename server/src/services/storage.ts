import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppContext } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { deleteStorageObject, getStorageObject, putStorageObject } from "../utils/storage";
import { uploads } from "../db/schema";
import { enforceFileAttachmentLimits, FileAttachmentLimitError } from "./file-attachments";
import { findDanglingUploads } from "./image-recycling";

function buf2hex(buffer: ArrayBuffer) {
    return [...new Uint8Array(buffer)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
}

export function StorageService(): Hono {
    const app = new Hono();

    // POST /storage
    app.post('/', async (c: AppContext) => {
        const uid = c.get('uid');
        const env = c.get('env');
        const db = c.get('db');
        const admin = c.get('admin');
        const serverConfig = c.get('serverConfig');
        
        const body = await profileAsync(c, 'storage_parse', () => c.req.parseBody());
        const key = (body.key as string) || "";
        const file = body.file as File;
        const kind = body.kind === "file" ? "file" : "image";
        const content = typeof body.content === "string" ? body.content : "";
        
        if (!uid) {
            return c.text('Unauthorized', 401);
        }
        if (!file) {
            return c.text("No file uploaded", 400);
        }

        if (kind === "file") {
            try {
                await profileAsync(c, 'storage_file_limit_check', () =>
                    enforceFileAttachmentLimits(db, serverConfig, content, Boolean(admin), Number(uid), file.size)
                );
            } catch (error) {
                if (error instanceof FileAttachmentLimitError) {
                    return c.text(error.message, error.status as any);
                }
                throw error;
            }
        }
        
        const originalName = key || file.name || "download";
        const suffix = originalName.includes(".") ? originalName.split('.').pop() : "";
        const fileBuffer = await profileAsync(c, 'storage_file_buffer', () => file.arrayBuffer());
        const hashArray = await profileAsync(c, 'storage_hash', () => crypto.subtle.digest(
            { name: 'SHA-1' },
            fileBuffer
        ));
        const hash = buf2hex(hashArray);
        const hashkey = `${kind === "file" ? "files/" : ""}${hash}${suffix ? `.${suffix}` : ""}`;
        
        try {
            const result = await profileAsync(c, 'storage_put', () => putStorageObject(
                env,
                hashkey,
                file,
                file.type,
                new URL(c.req.url).origin,
                kind === "file" ? { contentDisposition: buildAttachmentDisposition(originalName) } : undefined,
            ));
            // 登记上传（best-effort）：result.key 为含前缀的规范 key（images/<sha1>.<ext>），
            // 与「图片回收」扫描所用子串一致。失败不影响上传主流程。
            try {
                await db
                    .insert(uploads)
                    .values({
                        storageKey: result.key,
                        url: result.url,
                        kind,
                        originalName,
                        size: file.size,
                        mimeType: file.type || "application/octet-stream",
                        uid: Number(uid),
                    })
                    .onConflictDoNothing();
            } catch (registerError: any) {
                console.error('Failed to register upload:', registerError?.message ?? registerError);
            }
            return c.json({ url: result.url, name: originalName, size: file.size, kind });
        } catch (e: any) {
            console.error(e.message);
            const status = e.message?.includes('is not defined') ? 500 : 400;
            return c.text(e.message, status);
        }
    });

    app.delete('/:id', async (c: AppContext) => {
        const admin = c.get('admin');
        const db = c.get('db');
        const env = c.get('env');
        const id = Number.parseInt(c.req.param('id'), 10);

        if (!admin) {
            return c.text('Permission denied', 403);
        }
        if (!Number.isFinite(id)) {
            return c.text('Invalid upload id', 400);
        }

        const upload = await profileAsync(c, 'storage_delete_lookup', () =>
            db.query.uploads.findFirst({ where: eq(uploads.id, id) })
        );
        if (!upload) {
            return c.text('Not found', 404);
        }

        const dangling = await profileAsync(c, 'storage_delete_dangling_check', () => findDanglingUploads(db));
        if (!dangling.rows.some((row) => row.id === id)) {
            return c.text('Upload is still referenced', 409);
        }

        await profileAsync(c, 'storage_delete_object', () => deleteStorageObject(env, upload.storageKey));
        await profileAsync(c, 'storage_delete_registry', () =>
            db.delete(uploads).where(eq(uploads.id, id))
        );

        return c.text('OK');
    });

    return app;
}

export function BlobService(): Hono {
    const app = new Hono();

    app.get("/*", async (c: AppContext) => {
        const db = c.get("db");
        const env = c.get("env");
        const key = c.req.path.replace(/^\/blob\/?/, "");

        if (!key) {
            return c.text("Blob key is required", 400);
        }

        try {
            const decodedKey = decodeURIComponent(key);
            const response = await profileAsync(c, "blob_fetch", () => getStorageObject(env, decodedKey));

            if (!response) {
                return c.text("Not found", 404);
            }

            const headers = new Headers(response.headers);
            const upload = await profileAsync(c, "blob_upload_lookup", () =>
                db.query.uploads.findFirst({
                    where: eq(uploads.storageKey, decodedKey),
                    columns: { kind: true, originalName: true },
                })
            );

            if (upload?.kind === "file") {
                const fallbackName = decodedKey.split("/").pop() || "download";
                headers.set("Content-Disposition", buildAttachmentDisposition(upload.originalName || fallbackName));
                headers.set("X-Content-Type-Options", "nosniff");
            }

            return new Response(response.body, {
                status: response.status,
                headers,
            });
        } catch (error) {
            console.error("Blob fetch failed:", error);
            return c.text("Blob fetch failed", 500);
        }
    });

    return app;
}

function buildAttachmentDisposition(fileName: string) {
    const fallback = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "download";
    const encoded = encodeURIComponent(fileName)
        .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/\*/g, "%2A");
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
