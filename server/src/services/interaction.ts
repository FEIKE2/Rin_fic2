import { and, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppContext } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { feedBookmarks, feedLikes, feeds } from "../db/schema";
import { ForbiddenError, NotFoundError } from "../errors";
import { adjustFeedDynamicHotScore, getHotConfig } from "./hot-score";

export function InteractionService(): Hono {
    const app = new Hono();

    // GET /interaction/:feedId - Get like/bookmark status for current user
    app.get('/:feedId', async (c: AppContext) => {
        const db = c.get('db');
        const uid = c.get('uid');
        const feedId = parseInt(c.req.param('feedId'));

        const [likeCount] = await profileAsync(c, 'interaction_like_count', () =>
            db.select({ count: count() }).from(feedLikes).where(eq(feedLikes.feedId, feedId))
        );

        let liked = false;
        let bookmarked = false;
        if (uid) {
            const like = await profileAsync(c, 'interaction_like_check', () =>
                db.query.feedLikes.findFirst({ where: and(eq(feedLikes.feedId, feedId), eq(feedLikes.userId, uid)) })
            );
            const bookmark = await profileAsync(c, 'interaction_bookmark_check', () =>
                db.query.feedBookmarks.findFirst({ where: and(eq(feedBookmarks.feedId, feedId), eq(feedBookmarks.userId, uid)) })
            );
            liked = Boolean(like);
            bookmarked = Boolean(bookmark);
        }

        return c.json({ likes: likeCount.count, liked, bookmarked });
    });

    // POST /interaction/:feedId/like - Toggle like
    app.post('/:feedId/like', async (c: AppContext) => {
        const db = c.get('db');
        const serverConfig = c.get('serverConfig');
        const uid = c.get('uid');
        if (!uid) throw new ForbiddenError('Authentication required');
        const feedId = parseInt(c.req.param('feedId'));
        const config = await profileAsync(c, 'interaction_hot_config', () => getHotConfig(serverConfig));

        const existing = await profileAsync(c, 'interaction_like_existing', () =>
            db.query.feedLikes.findFirst({ where: and(eq(feedLikes.feedId, feedId), eq(feedLikes.userId, uid)) })
        );

        if (existing) {
            await profileAsync(c, 'interaction_like_delete', () =>
                db.delete(feedLikes).where(and(eq(feedLikes.feedId, feedId), eq(feedLikes.userId, uid)))
            );
            await profileAsync(c, 'interaction_like_hot_decrement', () =>
                adjustFeedDynamicHotScore(db, feedId, -config.likeWeight)
            );
            return c.json({ liked: false });
        } else {
            await profileAsync(c, 'interaction_like_insert', () =>
                db.insert(feedLikes).values({ feedId, userId: uid })
            );
            await profileAsync(c, 'interaction_like_hot_increment', () =>
                adjustFeedDynamicHotScore(db, feedId, config.likeWeight)
            );
            return c.json({ liked: true });
        }
    });

    // POST /interaction/:feedId/bookmark - Toggle bookmark
    app.post('/:feedId/bookmark', async (c: AppContext) => {
        const db = c.get('db');
        const serverConfig = c.get('serverConfig');
        const uid = c.get('uid');
        if (!uid) throw new ForbiddenError('Authentication required');
        const feedId = parseInt(c.req.param('feedId'));
        const config = await profileAsync(c, 'interaction_hot_config', () => getHotConfig(serverConfig));

        const existing = await profileAsync(c, 'interaction_bookmark_existing', () =>
            db.query.feedBookmarks.findFirst({ where: and(eq(feedBookmarks.feedId, feedId), eq(feedBookmarks.userId, uid)) })
        );

        if (existing) {
            await profileAsync(c, 'interaction_bookmark_delete', () =>
                db.delete(feedBookmarks).where(and(eq(feedBookmarks.feedId, feedId), eq(feedBookmarks.userId, uid)))
            );
            await profileAsync(c, 'interaction_bookmark_hot_decrement', () =>
                adjustFeedDynamicHotScore(db, feedId, -config.bookmarkWeight)
            );
            return c.json({ bookmarked: false });
        } else {
            await profileAsync(c, 'interaction_bookmark_insert', () =>
                db.insert(feedBookmarks).values({ feedId, userId: uid })
            );
            await profileAsync(c, 'interaction_bookmark_hot_increment', () =>
                adjustFeedDynamicHotScore(db, feedId, config.bookmarkWeight)
            );
            return c.json({ bookmarked: true });
        }
    });

    // GET /interaction/bookmarks - Get current user's bookmarked feeds
    app.get('/bookmarks/list', async (c: AppContext) => {
        const db = c.get('db');
        const uid = c.get('uid');
        if (!uid) throw new ForbiddenError('Authentication required');

        const bookmarks = await profileAsync(c, 'interaction_bookmarks_list', () =>
            db.query.feedBookmarks.findMany({
                where: eq(feedBookmarks.userId, uid),
                with: {
                    feed: {
                        columns: { id: true, title: true, summary: true, createdAt: true, updatedAt: true },
                        with: {
                            hashtags: { columns: {}, with: { hashtag: { columns: { id: true, name: true } } } },
                            user: { columns: { id: true, username: true, avatar: true } },
                        }
                    }
                },
                orderBy: (b, { desc }) => [desc(b.createdAt)],
            })
        );

        return c.json(bookmarks.map((b: any) => ({
            ...b.feed,
            hashtags: b.feed.hashtags.map((h: any) => h.hashtag),
        })));
    });

    return app;
}
