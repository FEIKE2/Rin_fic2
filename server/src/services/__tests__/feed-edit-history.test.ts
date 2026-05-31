import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FeedService } from '../feed';
import { Hono } from "hono";
import type { Variables } from "../../core/hono-types";
import { setupTestApp, cleanupTestDB } from '../../../tests/fixtures';
import type { Database } from 'bun:sqlite';

describe('FeedService - Edit History', () => {
    let db: any;
    let sqlite: Database;
    let env: Env;
    let app: Hono<{ Bindings: Env; Variables: Variables }>;

    beforeEach(async () => {
        const ctx = await setupTestApp(FeedService);
        db = ctx.db;
        sqlite = ctx.sqlite;
        env = ctx.env;
        app = ctx.app;

        // Seed test data
        await seedTestData(sqlite);
    });

    afterEach(() => {
        cleanupTestDB(sqlite);
    });

    async function seedTestData(sqlite: Database) {
        // Insert test users
        sqlite.exec(`
            INSERT INTO users (id, username, avatar, permission, openid) VALUES
                (1, 'admin', 'admin.png', 1, 'gh_admin'),
                (2, 'user1', 'user1.png', 0, 'gh_user1'),
                (3, 'user2', 'user2.png', 0, 'gh_user2')
        `);

        // Insert test feeds
        sqlite.exec(`
            INSERT INTO feeds (id, title, content, summary, uid, draft, listed) VALUES
                (1, 'Feed by User1', 'Original content', 'Summary', 2, 0, 1),
                (2, 'Feed by User2', 'Content', 'Summary', 3, 0, 1)
        `);

        // Create feed_edit_history table if not exists
        sqlite.exec(`
            CREATE TABLE IF NOT EXISTS feed_edit_history (
                id INTEGER PRIMARY KEY,
                feed_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                title TEXT,
                content TEXT NOT NULL,
                summary TEXT DEFAULT '',
                edit_reason TEXT DEFAULT '',
                created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
                FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
    }

    describe('POST /feed/:id - Update with edit history', () => {
        it('should save edit history when content changes', async () => {
            const res = await app.request('/1', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Updated Title',
                    content: 'Updated content',
                    summary: 'Summary',
                    listed: true,
                    editReason: 'Fixed typos'
                }),
            }, env);

            expect(res.status).toBe(200);

            // Verify edit history was saved
            const history = sqlite.prepare(`
                SELECT * FROM feed_edit_history WHERE feed_id = 1
            `).all() as any[];

            expect(history.length).toBe(1);
            expect(history[0].title).toBe('Feed by User1');
            expect(history[0].content).toBe('Original content');
            expect(history[0].edit_reason).toBe('Fixed typos');
            expect(history[0].user_id).toBe(2);
        });

        it('should not save edit history when content unchanged', async () => {
            const res = await app.request('/1', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Feed by User1',
                    content: 'Original content',
                    summary: 'Summary',
                    listed: true,
                }),
            }, env);

            expect(res.status).toBe(200);

            // Verify no edit history was saved
            const history = sqlite.prepare(`
                SELECT * FROM feed_edit_history WHERE feed_id = 1
            `).all();

            expect(history.length).toBe(0);
        });

        it('should save edit history when title changes', async () => {
            const res = await app.request('/1', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'New Title',
                    content: 'Original content',
                    summary: 'Summary',
                    listed: true,
                }),
            }, env);

            expect(res.status).toBe(200);

            const history = sqlite.prepare(`
                SELECT * FROM feed_edit_history WHERE feed_id = 1
            `).all();

            expect(history.length).toBe(1);
        });
    });

    describe('GET /feed/:id/history - Get edit history', () => {
        beforeEach(() => {
            // Insert test edit history
            sqlite.exec(`
                INSERT INTO feed_edit_history (id, feed_id, user_id, title, content, summary, edit_reason, created_at)
                VALUES
                    (1, 1, 2, 'Old Title 1', 'Old content 1', 'Old summary', 'First edit', unixepoch() - 100),
                    (2, 1, 2, 'Old Title 2', 'Old content 2', 'Old summary', 'Second edit', unixepoch() - 50)
            `);
        });

        it('should return edit history for feed owner', async () => {
            const res = await app.request('/1/history', {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                },
            }, env);

            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.data).toBeArray();
            expect(data.data.length).toBe(2);
            expect(data.data[0].title).toBe('Old Title 2'); // Most recent first
            expect(data.data[0].editReason).toBe('Second edit');
            expect(data.data[0].user).toBeDefined();
            expect(data.data[0].user.username).toBe('user1');
        });

        it('should return edit history for admin', async () => {
            const res = await app.request('/1/history', {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                },
            }, env);

            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.data.length).toBe(2);
        });

        it('should deny access to other users', async () => {
            const res = await app.request('/1/history', {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer mock_token_3',
                },
            }, env);

            expect(res.status).toBe(403);
        });

        it('should return 404 for non-existent feed', async () => {
            const res = await app.request('/999/history', {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                },
            }, env);

            expect(res.status).toBe(404);
        });
    });

    describe('GET /feed/:id/history/:historyId - Get specific history version', () => {
        beforeEach(() => {
            sqlite.exec(`
                INSERT INTO feed_edit_history (id, feed_id, user_id, title, content, summary, edit_reason)
                VALUES (1, 1, 2, 'Old Title', 'Old content', 'Old summary', 'Test edit')
            `);
        });

        it('should return specific history version for feed owner', async () => {
            const res = await app.request('/1/history/1', {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                },
            }, env);

            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.id).toBe(1);
            expect(data.title).toBe('Old Title');
            expect(data.content).toBe('Old content');
            expect(data.editReason).toBe('Test edit');
            expect(data.user).toBeDefined();
        });

        it('should deny access to other users', async () => {
            const res = await app.request('/1/history/1', {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer mock_token_3',
                },
            }, env);

            expect(res.status).toBe(403);
        });

        it('should return 404 for non-existent history', async () => {
            const res = await app.request('/1/history/999', {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                },
            }, env);

            expect(res.status).toBe(404);
        });

        it('should return 400 if history does not belong to feed', async () => {
            // Insert history for feed 2
            sqlite.exec(`
                INSERT INTO feed_edit_history (id, feed_id, user_id, title, content)
                VALUES (2, 2, 3, 'Title', 'Content')
            `);

            // Try to access feed 2's history via feed 1
            const res = await app.request('/1/history/2', {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                },
            }, env);

            expect(res.status).toBe(400);
        });
    });
});
