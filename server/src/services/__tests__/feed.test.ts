import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FeedService } from '../feed';
import { Hono } from "hono";
import type { Variables } from "../../core/hono-types";
import { setupTestApp, createTestUser, cleanupTestDB } from '../../../tests/fixtures';
import type { Database } from 'bun:sqlite';
import type { TestCacheImpl } from '../../../tests/fixtures';

describe('FeedService', () => {
    let db: any;
    let sqlite: Database;
    let env: Env;
    let app: Hono<{ Bindings: Env; Variables: Variables }>;
    let cache: TestCacheImpl;
    let serverConfig: TestCacheImpl;
    let clientConfig: TestCacheImpl;

    beforeEach(async () => {
        const ctx = await setupTestApp(FeedService);
        db = ctx.db;
        sqlite = ctx.sqlite;
        env = ctx.env;
        app = ctx.app;
        cache = ctx.cache;
        serverConfig = ctx.serverConfig;
        clientConfig = ctx.clientConfig;
        
        // Create test user
        await createTestUser(sqlite);
    });

    afterEach(() => {
        cleanupTestDB(sqlite);
    });



    describe('GET / - List feeds', () => {
        it('should list published feeds', async () => {
            // Create feeds via API
            const res1 = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test Feed 1',
                    content: 'Content 1',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            expect(res1.status).toBe(200);
            
            const res2 = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test Feed 2',
                    content: 'Content 2',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            expect(res2.status).toBe(200);
            
            const listRes = await app.request('/?page=1&limit=10', { method: 'GET' }, env);
            
            expect(listRes.status).toBe(200);
            const data = await listRes.json() as any;
            expect(data.size).toBe(2);
            expect(data.data).toBeArray();
        });

        it('should return empty list when no feeds exist', async () => {
            const res = await app.request('/', { method: 'GET' }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.size).toBe(0);
            expect(data.data).toEqual([]);
        });

        it('should filter drafts for non-admin users', async () => {
            // Create a draft feed
            await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Draft Feed',
                    content: 'Draft Content',
                    listed: true,
                    draft: true,
                    tags: [],
                }),
            }, env);
            
            const res = await app.request('/?type=draft', { method: 'GET' }, env);
            
            expect(res.status).toBe(403);
        });

        it('should allow admin to view drafts', async () => {
            // Create a draft feed
            await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Draft Feed',
                    content: 'Draft Content',
                    listed: true,
                    draft: true,
                    tags: [],
                }),
            }, env);
            
            const res = await app.request('/?type=draft', {
                method: 'GET',
                headers: { 'Authorization': 'Bearer mock_token_1' },
            }, env);
            
            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.size).toBe(1);
        });

        it('should order popular feeds by top and hot score', async () => {
            sqlite.exec(`
                INSERT INTO feeds (id, title, content, uid, draft, listed, hot_score, hot_content_score, hot_dynamic_score, created_at) VALUES
                    (10, 'Low hot', 'Content', 1, 0, 1, 10, 0, 10, 100),
                    (11, 'High hot', 'Content', 1, 0, 1, 50, 0, 50, 90),
                    (12, 'Pinned', 'Content', 1, 0, 1, 1, 0, 1, 80)
            `);
            sqlite.exec(`UPDATE feeds SET top = 1 WHERE id = 12`);

            const res = await app.request('/?sort=popular&page=1&limit=10', { method: 'GET' }, env);

            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.data.map((item: any) => item.id)).toEqual([12, 11, 10]);
        });
    });

    describe('GET /:id - Get single feed', () => {
        it('should return feed by id', async () => {
            // Create a feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test Feed',
                    content: 'Test Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const getRes = await app.request(`/${feedId}`, { method: 'GET' }, env);
            
            expect(getRes.status).toBe(200);
            const data = await getRes.json() as any;
            expect(data.title).toBe('Test Feed');
        });

        it('should return AI summary generation status for a queued feed', async () => {
            await serverConfig.set('ai_summary.enabled', 'true', false);
            await serverConfig.set('ai_summary.provider', 'worker-ai', false);
            await serverConfig.set('ai_summary.model', 'llama-3-8b', false);

            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Queued AI Feed',
                    content: 'Queued AI content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            const createData = await createRes.json() as any;
            const getRes = await app.request(`/${createData.insertedId}`, { method: 'GET' }, env);

            expect(getRes.status).toBe(200);
            const data = await getRes.json() as any;
            expect(data.ai_summary_status).toBe('pending');
            expect(data.ai_summary_error).toBe('');
        });

        it('should return 404 for non-existent feed', async () => {
            const res = await app.request('/9999', { method: 'GET' }, env);
            
            expect(res.status).toBe(404);
        });

        it('should bypass stale public cache when cache is disabled', async () => {
            await clientConfig.set('cache.enabled', false);
            await clientConfig.set('counter.enabled', false);

            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Fresh Feed',
                    content: 'Fresh Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            const createData = await createRes.json() as any;
            await cache.set(`feed_${createData.insertedId}`, {
                id: createData.insertedId,
                title: 'Stale Feed',
                content: 'stale',
                summary: '',
                ai_summary: '',
                ai_summary_status: 'idle',
                ai_summary_error: '',
                draft: 0,
                listed: 1,
                uid: 1,
                alias: null,
                hashtags: [],
                user: { id: 1, username: 'testuser', avatar: 'avatar.png' },
            });

            const getRes = await app.request(`/${createData.insertedId}`, { method: 'GET' }, env);
            const data = await getRes.json() as any;

            expect(data.title).toBe('Fresh Feed');
        });
    });

    describe('POST / - Create feed', () => {
        it('should create feed with admin permission', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'New Test Feed',
                    content: 'This is a new test feed content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            expect(res.status).toBe(200);
            const data = await res.json() as any;
            expect(data.insertedId).toBeDefined();
            const row = sqlite.prepare(`SELECT hot_content_score, hot_score FROM feeds WHERE id = ?`).get(data.insertedId) as any;
            expect(row.hot_content_score).toBe(0);
            expect(row.hot_score).toBe(0);
        });

        it('should initialize content hot score when creating a rich feed', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Rich hot feed',
                    content: `${'字'.repeat(2500)}\n![one](one.png)\n<img src="two.png" />`,
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            expect(res.status).toBe(200);
            const data = await res.json() as any;
            const row = sqlite.prepare(`SELECT hot_content_score, hot_score FROM feeds WHERE id = ?`).get(data.insertedId) as any;
            expect(row.hot_content_score).toBe(140);
            expect(row.hot_score).toBe(140);
        });

        it('should require authentication', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Test',
                    content: 'Test',
                    tags: [],
                    draft: false,
                    listed: true,
                }),
            }, env);

            expect(res.status).toBe(401);
        });

        it('should reject non-admin feed creation while posting maintenance is enabled', async () => {
            sqlite.exec(`INSERT INTO users (id, username, avatar, openid, permission) VALUES (2, 'author', 'author.png', 'gh_author', 0)`);
            await clientConfig.set('maintenance.posting_disabled', true);

            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Blocked Feed',
                    content: 'Blocked Content',
                    tags: [],
                    draft: false,
                    listed: true,
                }),
            }, env);

            expect(res.status).toBe(503);
            expect(await res.text()).toBe('该功能维护中……');
        });

        it('should allow admin feed creation while posting maintenance is enabled', async () => {
            await clientConfig.set('maintenance.posting_disabled', true);

            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Admin Feed',
                    content: 'Admin Content',
                    tags: [],
                    draft: false,
                    listed: true,
                }),
            }, env);

            expect(res.status).toBe(200);
        });

        it('should require title', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: 'Content without title',
                    tags: [],
                    draft: false,
                    listed: true,
                }),
            }, env);

            expect(res.status).toBe(400);
        });

        it('should require content', async () => {
            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test',
                    content: '',
                    tags: [],
                }),
            }, env);

            expect(res.status).toBe(400);
        });

        it('should reject unknown rin_file attachments for non-admin users', async () => {
            sqlite.exec(`INSERT INTO users (id, username, avatar, openid, permission) VALUES (2, 'author', 'author.png', 'gh_author', 0)`);

            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'File Feed',
                    content: '[file.pdf](https://cdn.example/file.pdf "rin_file")',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            expect(res.status).toBe(400);
            expect(await res.text()).toContain('Unknown file attachment');
        });

        it('should allow non-admin users to reference uploaded files from other users without counting them against limits', async () => {
            sqlite.exec(`INSERT INTO users (id, username, avatar, openid, permission) VALUES (2, 'author', 'author.png', 'gh_author', 0)`);
            await serverConfig.set('upload.file_total_size_mb', 1);
            sqlite.exec(`
                INSERT INTO uploads (storage_key, url, kind, original_name, size, mime_type, uid)
                VALUES ('images/files/shared.pdf', 'https://cdn.example/shared.pdf', 'file', 'shared.pdf', 29 * 1024 * 1024, 'application/pdf', 1)
            `);

            const res = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Shared File Feed',
                    content: '[shared.pdf](https://cdn.example/shared.pdf "rin_file")',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            expect(res.status).toBe(200);
        });
    });

    describe('POST /:id - Update feed', () => {
        it('should update feed with admin permission', async () => {
            // Create feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Original Title',
                    content: 'Original Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const updateRes = await app.request(`/${feedId}`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Updated Title',
                    content: 'Updated content',
                    listed: true,
                }),
            }, env);

            expect(updateRes.status).toBe(200);
            
            // Verify update
            const getRes = await app.request(`/${feedId}`, { method: 'GET' }, env);
            const data = await getRes.json() as any;
            expect(data.title).toBe('Updated Title');
        });

        it('should require admin permission to update', async () => {
            // Create feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Original',
                    content: 'Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const updateRes = await app.request(`/${feedId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'New Title',
                    listed: true,
                }),
            }, env);

            expect(updateRes.status).toBe(403);
        });

        it('should ignore top changes from non-admin authors', async () => {
            sqlite.exec(`INSERT INTO users (id, username, avatar, openid, permission) VALUES (2, 'author', 'author.png', 'gh_author', 0)`);

            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Author Feed',
                    content: 'Author Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);

            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;

            const updateRes = await app.request(`/${createData.insertedId}`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Updated Author Feed',
                    top: 1,
                }),
            }, env);

            expect(updateRes.status).toBe(200);
            const row = sqlite.prepare(`SELECT top, title FROM feeds WHERE id = ?`).get(createData.insertedId) as any;
            expect(row.top).toBe(0);
            expect(row.title).toBe('Updated Author Feed');
        });

        it('should reject non-admin author updates while posting maintenance is enabled', async () => {
            sqlite.exec(`INSERT INTO users (id, username, avatar, openid, permission) VALUES (2, 'author', 'author.png', 'gh_author', 0)`);
            sqlite.exec(`INSERT INTO feeds (id, title, content, uid, draft, listed) VALUES (20, 'Author Feed', 'Content', 2, 0, 1)`);
            await clientConfig.set('maintenance.posting_disabled', true);

            const updateRes = await app.request('/20', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Blocked Update',
                }),
            }, env);

            expect(updateRes.status).toBe(503);
            expect(await updateRes.text()).toBe('该功能维护中……');
            const row = sqlite.prepare(`SELECT title FROM feeds WHERE id = 20`).get() as any;
            expect(row.title).toBe('Author Feed');
        });
    });

    describe('POST /top/:id - Set top', () => {
        it('should require admin permission even for the author', async () => {
            sqlite.exec(`INSERT INTO users (id, username, avatar, openid, permission) VALUES (2, 'author', 'author.png', 'gh_author', 0)`);
            sqlite.exec(`INSERT INTO feeds (id, title, content, uid, draft, listed, top) VALUES (20, 'Author Feed', 'Content', 2, 0, 1, 0)`);

            const res = await app.request('/top/20', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_2',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ top: 1 }),
            }, env);

            expect(res.status).toBe(403);
            const row = sqlite.prepare(`SELECT top FROM feeds WHERE id = 20`).get() as any;
            expect(row.top).toBe(0);
        });
    });

    describe('DELETE /:id - Delete feed', () => {
        it('should delete feed with admin permission', async () => {
            // Create feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'To Delete',
                    content: 'Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const deleteRes = await app.request(`/${feedId}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer mock_token_1' },
            }, env);

            expect(deleteRes.status).toBe(200);
            
            // Verify deletion
            const getRes = await app.request(`/${feedId}`, { method: 'GET' }, env);
            expect(getRes.status).toBe(404);
        });

        it('should require admin permission to delete', async () => {
            // Create feed first
            const createRes = await app.request('/', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer mock_token_1',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: 'Test',
                    content: 'Content',
                    listed: true,
                    draft: false,
                    tags: [],
                }),
            }, env);
            
            expect(createRes.status).toBe(200);
            const createData = await createRes.json() as any;
            const feedId = createData.insertedId;
            
            const deleteRes = await app.request(`/${feedId}`, { method: 'DELETE' }, env);

            expect(deleteRes.status).toBe(403);
        });

        it('should return 404 for non-existent feed', async () => {
            const res = await app.request('/9999', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer mock_token_1' },
            }, env);

            expect(res.status).toBe(404);
        });

        it('should reject non-admin author deletes while posting maintenance is enabled', async () => {
            sqlite.exec(`INSERT INTO users (id, username, avatar, openid, permission) VALUES (2, 'author', 'author.png', 'gh_author', 0)`);
            sqlite.exec(`INSERT INTO feeds (id, title, content, uid, draft, listed) VALUES (30, 'Author Feed', 'Content', 2, 0, 1)`);
            await clientConfig.set('maintenance.posting_disabled', true);

            const deleteRes = await app.request('/30', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer mock_token_2' },
            }, env);

            expect(deleteRes.status).toBe(503);
            expect(await deleteRes.text()).toBe('该功能维护中……');
            expect(sqlite.prepare(`SELECT id FROM feeds WHERE id = 30`).get()).not.toBeNull();
        });
    });
});
