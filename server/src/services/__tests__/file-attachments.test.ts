import { afterEach, describe, expect, it } from "bun:test";
import { createMockDB, cleanupTestDB, TestCacheImpl } from "../../../tests/fixtures";
import type { Database } from "bun:sqlite";
import {
    enforceFileAttachmentLimits,
    extractRinFileUrls,
    FileAttachmentLimitError,
    summarizeFileAttachments,
    summarizeOwnedFileAttachments,
} from "../file-attachments";

describe("file-attachments", () => {
    let sqlite: Database | undefined;

    function setup() {
        const mock = createMockDB();
        sqlite = mock.sqlite;
        sqlite!.exec(`
            INSERT INTO users (id, username, openid, permission) VALUES
                (1, 'user1', 'gh_1', 0),
                (2, 'user2', 'gh_2', 0)
        `);
        return mock;
    }

    afterEach(() => {
        if (sqlite) {
            cleanupTestDB(sqlite);
            sqlite = undefined;
        }
    });

    it("extracts only rin_file markdown links", () => {
        expect(extractRinFileUrls([
            `[foo.pdf](https://cdn.example/foo.pdf "rin_file")`,
            `[normal](https://example.com)`,
            `[bar.zip](https://cdn.example/bar.zip "other")`,
        ].join("\n"))).toEqual(["https://cdn.example/foo.pdf"]);
    });

    it("counts shared file references without requiring ownership", async () => {
        const { db } = setup();
        sqlite!.exec(`
            INSERT INTO uploads (storage_key, url, kind, original_name, size, mime_type, uid) VALUES
                ('images/files/a.pdf', 'https://cdn.example/a.pdf', 'file', 'a.pdf', 1024, 'application/pdf', 2)
        `);

        const summary = await summarizeFileAttachments(db, `[a.pdf](https://cdn.example/a.pdf "rin_file")`);

        expect(summary.count).toBe(1);
        expect(summary.totalSize).toBe(1024);
    });

    it("does not count shared references against the current user's limits", async () => {
        const { db } = setup();
        sqlite!.exec(`
            INSERT INTO uploads (storage_key, url, kind, original_name, size, mime_type, uid) VALUES
                ('images/files/shared.pdf', 'https://cdn.example/shared.pdf', 'file', 'shared.pdf', 29 * 1024 * 1024, 'application/pdf', 2)
        `);

        const summary = await summarizeOwnedFileAttachments(db, `[shared.pdf](https://cdn.example/shared.pdf "rin_file")`, 1);

        expect(summary.count).toBe(0);
        expect(summary.totalSize).toBe(0);
    });

    it("enforces count and total size limits for non-admin users", async () => {
        const { db } = setup();
        const serverConfig = new TestCacheImpl();
        await serverConfig.set("upload.file_count_limit", 1);
        await serverConfig.set("upload.file_total_size_mb", 1);
        sqlite!.exec(`
            INSERT INTO uploads (storage_key, url, kind, original_name, size, mime_type, uid) VALUES
                ('images/files/a.pdf', 'https://cdn.example/a.pdf', 'file', 'a.pdf', 900000, 'application/pdf', 1)
        `);

        await expect(enforceFileAttachmentLimits(db, serverConfig, `[a.pdf](https://cdn.example/a.pdf "rin_file")`, false, 1, 200000))
            .rejects.toBeInstanceOf(FileAttachmentLimitError);
        await expect(enforceFileAttachmentLimits(db, serverConfig, `[a.pdf](https://cdn.example/a.pdf "rin_file")`, false, 1, 0))
            .resolves.toBeUndefined();
        await expect(enforceFileAttachmentLimits(db, serverConfig, `[a.pdf](https://cdn.example/a.pdf "rin_file")`, false, 1, 1))
            .rejects.toBeInstanceOf(FileAttachmentLimitError);
    });

    it("allows admins to bypass attachment limits and unknown file checks", async () => {
        const { db } = setup();
        const serverConfig = new TestCacheImpl();
        await serverConfig.set("upload.file_count_limit", 0);
        await serverConfig.set("upload.file_total_size_mb", 0);

        await expect(enforceFileAttachmentLimits(db, serverConfig, `[x.zip](https://example.com/x.zip "rin_file")`, true, 1, 50 * 1024 * 1024))
            .resolves.toBeUndefined();
    });
});
