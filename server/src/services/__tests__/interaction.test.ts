import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { InteractionService } from '../interaction';
import { setupTestApp, cleanupTestDB, seedTestData } from '../../../tests/fixtures';
import type { Database } from 'bun:sqlite';
import type { Variables } from "../../core/hono-types";
import type { Hono } from "hono";

describe('InteractionService', () => {
    let sqlite: Database;
    let env: Env;
    let app: Hono<{ Bindings: Env; Variables: Variables }>;

    beforeEach(async () => {
        const ctx = await setupTestApp(InteractionService);
        sqlite = ctx.sqlite;
        env = ctx.env;
        app = ctx.app;
        app.onError((err, c) => {
            const error = err as any;
            if (error.code && error.statusCode) {
                return c.json({
                    success: false,
                    error: {
                        code: error.code,
                        message: error.message,
                        details: error.details,
                    },
                }, error.statusCode as any);
            }
            return c.json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: err.message || 'An unexpected error occurred',
                },
            }, 500);
        });
        seedTestData(sqlite);
    });

    afterEach(() => {
        cleanupTestDB(sqlite);
    });

    it('should return like count and current user interaction state', async () => {
        sqlite.exec(`INSERT INTO feed_likes (feed_id, user_id) VALUES (1, 1)`);
        sqlite.exec(`INSERT INTO feed_bookmarks (feed_id, user_id) VALUES (1, 1)`);

        const res = await app.request('/1', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer mock_token_1' },
        }, env);

        expect(res.status).toBe(200);
        const data = await res.json() as any;
        expect(data).toEqual({ likes: 1, liked: true, bookmarked: true });
    });

    it('should toggle like for authenticated users', async () => {
        const likeRes = await app.request('/1/like', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer mock_token_1' },
        }, env);

        expect(likeRes.status).toBe(200);
        expect(await likeRes.json() as any).toEqual({ liked: true });
        expect((sqlite.prepare(`SELECT hot_dynamic_score, hot_score FROM feeds WHERE id = 1`).get() as any).hot_dynamic_score).toBe(5);

        const unlikeRes = await app.request('/1/like', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer mock_token_1' },
        }, env);

        expect(unlikeRes.status).toBe(200);
        expect(await unlikeRes.json() as any).toEqual({ liked: false });
        expect((sqlite.prepare(`SELECT hot_dynamic_score, hot_score FROM feeds WHERE id = 1`).get() as any).hot_dynamic_score).toBe(0);
    });

    it('should toggle bookmark for authenticated users', async () => {
        const bookmarkRes = await app.request('/1/bookmark', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer mock_token_1' },
        }, env);

        expect(bookmarkRes.status).toBe(200);
        expect(await bookmarkRes.json() as any).toEqual({ bookmarked: true });
        expect((sqlite.prepare(`SELECT hot_dynamic_score, hot_score FROM feeds WHERE id = 1`).get() as any).hot_dynamic_score).toBe(10);

        const unbookmarkRes = await app.request('/1/bookmark', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer mock_token_1' },
        }, env);

        expect(unbookmarkRes.status).toBe(200);
        expect(await unbookmarkRes.json() as any).toEqual({ bookmarked: false });
        expect((sqlite.prepare(`SELECT hot_dynamic_score, hot_score FROM feeds WHERE id = 1`).get() as any).hot_dynamic_score).toBe(0);
    });

    it('should require authentication to change interactions', async () => {
        const likeRes = await app.request('/1/like', { method: 'POST' }, env);
        const bookmarkRes = await app.request('/1/bookmark', { method: 'POST' }, env);

        expect(likeRes.status).toBe(403);
        expect(bookmarkRes.status).toBe(403);
    });
});
