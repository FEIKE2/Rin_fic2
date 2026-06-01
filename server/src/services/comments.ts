import { Hono } from "hono";
import type { AppContext } from "../core/hono-types";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { commentLikes, comments, feeds, users } from "../db/schema";
import { profileAsync } from "../core/server-timing";
import { notify } from "../utils/webhook";
import { resolveWebhookConfig } from "./config-helpers";
import { adjustFeedDynamicHotScore, getHotConfig } from "./hot-score";
import { extractRinFileUrls } from "./file-attachments";

export function CommentService(): Hono {
    const app = new Hono();

    app.get('/:feed', async (c: AppContext) => {
        const db = c.get('db');
        const feedId = parseInt(c.req.param('feed'));

        const feed = await profileAsync(c, 'comment_list_feed', () =>
            db.query.feeds.findFirst({ where: eq(feeds.id, feedId), columns: { draft: true } })
        );
        if (feed?.draft) {
            return c.json([]);
        }
        
        const comment_list = await profileAsync(c, 'comment_list_db', () => db.query.comments.findMany({
            where: eq(comments.feedId, feedId),
            columns: { feedId: false, userId: false },
            with: {
                user: {
                    columns: { id: true, username: true, avatar: true, permission: true }
                }
            },
            orderBy: [desc(comments.createdAt)]
        }));

        const commentIds = comment_list.map((comment: any) => comment.id);
        const commentById = new Map(comment_list.map((comment: any) => [comment.id, comment]));
        const likeCounts = new Map<number, number>();
        const likedIds = new Set<number>();

        if (commentIds.length > 0) {
            const counts = await profileAsync(c, 'comment_list_like_counts', () =>
                db
                    .select({ commentId: commentLikes.commentId, count: count() })
                    .from(commentLikes)
                    .where(inArray(commentLikes.commentId, commentIds))
                    .groupBy(commentLikes.commentId)
            );

            for (const item of counts) {
                likeCounts.set(item.commentId, item.count);
            }

            const uid = c.get('uid');
            if (uid) {
                const liked = await profileAsync(c, 'comment_list_liked', () =>
                    db.query.commentLikes.findMany({
                        where: and(
                            eq(commentLikes.userId, uid),
                            inArray(commentLikes.commentId, commentIds),
                        ),
                        columns: { commentId: true },
                    })
                );

                for (const item of liked) {
                    likedIds.add(item.commentId);
                }
            }
        }
        
        // 将结果统一为前端兼容格式：登录用户用 user 字段，游客用 guestName 等
        const normalized = comment_list.map((c: any) => {
            const base = {
                ...c,
                likes: likeCounts.get(c.id) ?? 0,
                liked: likedIds.has(c.id),
                replyTo: buildReplyTarget(c, commentById),
                replies: [],
            };

            if (c.user) {
                // 登录用户的评论
                return base;
            }

            // 游客评论：去掉空的 user 字段，保留 guestName 等
            const { user, ...rest } = base;
            return {
                ...rest,
                user: null,
                guestName: rest.guestName || "",
                guestContact: rest.guestContact || "",
            };
        });

        const topLevel = normalized.filter((comment: any) => !comment.parentId);
        const topLevelById = new Map(topLevel.map((comment: any) => [comment.id, comment]));
        const replies = normalized
            .filter((comment: any) => comment.parentId)
            .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        for (const reply of replies) {
            const parent = topLevelById.get(reply.parentId);
            if (parent) {
                parent.replies.push({ ...reply, replies: [] });
            } else {
                topLevel.push(reply);
            }
        }
        
        return c.json(topLevel);
    });

    app.post('/:feed', async (c: AppContext) => {
        const db = c.get('db');
        const env = c.get('env');
        const serverConfig = c.get('serverConfig');
        const uid = c.get('uid');
        const feedId = parseInt(c.req.param('feed'));
        const body = await profileAsync(c, 'comment_create_parse', () => c.req.json());
        const { content, guestName, guestContact } = body;
        let parentId = body.parentId ? Number(body.parentId) : null;
        let replyToId: number | null = null;
        let replyToContent = "";
        
        if (!content) {
            return c.text('Content is required', 400);
        }

        if (typeof content === 'string') {
            // 图片 markdown 不计入 150 字上限，但限制每条评论最多 1 张图，且总长有绝对上限
            const IMAGE_MD = /!\[[^\]]*\]\([^)]*\)/g;
            if ((content.match(IMAGE_MD) || []).length > 1) {
                return c.text('Too many images', 400);
            }
            if (content.replace(IMAGE_MD, '').length > 150) {
                return c.text('Comment too long', 400);
            }
            if (content.length > 1000) {
                return c.text('Comment too long', 400);
            }
            if (extractRinFileUrls(content).length > 0) {
                return c.text('File attachments are not allowed in comments', 400);
            }
        }
        
        const exist = await profileAsync(c, 'comment_create_feed', () => db.query.feeds.findFirst({ where: eq(feeds.id, feedId) }));
        if (!exist) {
            return c.text('Feed not found', 400);
        }

        if (exist.draft) {
            return c.text('Draft comments are disabled', 400);
        }

        if (parentId) {
            const requestedParentId = parentId;
            const parent = await profileAsync(c, 'comment_create_parent', () =>
                db.query.comments.findFirst({ where: eq(comments.id, requestedParentId) })
            );

            if (!parent || parent.feedId !== feedId) {
                return c.text('Parent comment not found', 400);
            }

            if (parent.deletedAt) {
                return c.text('Parent comment has been deleted', 400);
            }

            // 微信式单层回复：回复别人的回复时，也挂到顶层评论下面。
            parentId = parent.parentId ?? parent.id;
            replyToId = parent.id;
            replyToContent = parent.content;
        }

        // 登录用户评论
        if (uid) {
            const user = await profileAsync(c, 'comment_create_user', () => db.query.users.findFirst({ where: eq(users.id, uid) }));
            if (!user) {
                return c.text('User not found', 400);
            }

            await db.insert(comments).values({
                feedId,
                parentId,
                replyToId,
                replyToContent,
                userId: uid,
                content
            });
            const hotConfig = await profileAsync(c, 'comment_create_hot_config', () => getHotConfig(serverConfig));
            await profileAsync(c, 'comment_create_hot_score', () =>
                adjustFeedDynamicHotScore(db, feedId, parentId ? hotConfig.replyWeight : hotConfig.commentWeight)
            );

            const { webhookUrl, webhookMethod, webhookContentType, webhookHeaders, webhookBodyTemplate } =
                await profileAsync(c, 'comment_create_webhook_config', () => resolveWebhookConfig(serverConfig, env));
            const frontendUrl = new URL(c.req.url).origin;
            try {
                await profileAsync(c, 'comment_create_notify', () => notify(
                    webhookUrl || "",
                    {
                        event: "comment.created",
                        message: `${frontendUrl}/feed/${feedId}\n${user.username} 评论了: ${exist.title}\n${content}`,
                        title: exist.title || "",
                        url: `${frontendUrl}/feed/${feedId}`,
                        username: user.username,
                        content,
                    },
                    {
                        method: webhookMethod,
                        contentType: webhookContentType,
                        headers: webhookHeaders,
                        bodyTemplate: webhookBodyTemplate,
                    },
                ));
            } catch (error) {
                console.error("Failed to send comment webhook", error);
            }
            return c.text('OK');
        }

        // 游客评论
        if (!guestName || !guestName.trim()) {
            return c.text('Guest name is required', 400);
        }

        await db.insert(comments).values({
            feedId,
            parentId,
            replyToId,
            replyToContent,
            userId: null,
            content,
            guestName: guestName.trim(),
            guestContact: guestContact?.trim() || "",
            approved: 1,
        });
        const hotConfig = await profileAsync(c, 'comment_create_hot_config', () => getHotConfig(serverConfig));
        await profileAsync(c, 'comment_create_hot_score', () =>
            adjustFeedDynamicHotScore(db, feedId, parentId ? hotConfig.replyWeight : hotConfig.commentWeight)
        );

        const { webhookUrl, webhookMethod, webhookContentType, webhookHeaders, webhookBodyTemplate } =
            await profileAsync(c, 'comment_create_webhook_config', () => resolveWebhookConfig(serverConfig, env));
        const frontendUrl = new URL(c.req.url).origin;
        try {
            await profileAsync(c, 'comment_create_notify', () => notify(
                webhookUrl || "",
                {
                    event: "comment.created",
                    message: `${frontendUrl}/feed/${feedId}\n游客 ${guestName} 评论了: ${exist.title}\n${content}`,
                    title: exist.title || "",
                    url: `${frontendUrl}/feed/${feedId}`,
                    username: guestName,
                    content,
                },
                {
                    method: webhookMethod,
                    contentType: webhookContentType,
                    headers: webhookHeaders,
                    bodyTemplate: webhookBodyTemplate,
                },
            ));
        } catch (error) {
            console.error("Failed to send comment webhook", error);
        }
        return c.text('OK');
    });

    app.post('/:id/like', async (c: AppContext) => {
        const db = c.get('db');
        const uid = c.get('uid');

        if (!uid) {
            return c.text('Unauthorized', 401);
        }

        const id = parseInt(c.req.param('id'));
        const comment = await profileAsync(c, 'comment_like_lookup', () =>
            db.query.comments.findFirst({ where: eq(comments.id, id) })
        );

        if (!comment) {
            return c.text('Not found', 404);
        }

        if (comment.deletedAt) {
            return c.text('Comment has been deleted', 400);
        }

        const existing = await profileAsync(c, 'comment_like_existing', () =>
            db.query.commentLikes.findFirst({
                where: and(eq(commentLikes.commentId, id), eq(commentLikes.userId, uid)),
            })
        );

        if (existing) {
            await profileAsync(c, 'comment_like_delete', () =>
                db.delete(commentLikes).where(and(eq(commentLikes.commentId, id), eq(commentLikes.userId, uid)))
            );
            return c.json({ liked: false });
        }

        await profileAsync(c, 'comment_like_insert', () =>
            db.insert(commentLikes).values({ commentId: id, userId: uid })
        );
        return c.json({ liked: true });
    });

    app.delete('/:id', async (c: AppContext) => {
        const db = c.get('db');
        const serverConfig = c.get('serverConfig');
        const uid = c.get('uid');
        const admin = c.get('admin');
        
        if (uid === undefined) {
            return c.text('Unauthorized', 401);
        }
        
        const id_num = parseInt(c.req.param('id'));
        const comment = await profileAsync(c, 'comment_delete_lookup', () => db.query.comments.findFirst({ where: eq(comments.id, id_num) }));
        
        if (!comment) {
            return c.text('Not found', 404);
        }
        
        // 管理员可删任意评论；普通用户只能删自己的
        if (admin) {
            await db.update(comments).set({
                content: "",
                deletedAt: new Date(),
                updatedAt: new Date(),
            }).where(eq(comments.id, id_num));
            if (!comment.deletedAt) {
                const hotConfig = await profileAsync(c, 'comment_delete_hot_config', () => getHotConfig(serverConfig));
                await profileAsync(c, 'comment_delete_hot_score', () =>
                    adjustFeedDynamicHotScore(db, comment.feedId, comment.parentId ? -hotConfig.replyWeight : -hotConfig.commentWeight)
                );
            }
            return c.text('OK');
        }
        
        if (comment.userId !== uid) {
            return c.text('Permission denied', 403);
        }
        
        await db.update(comments).set({
            content: "",
            deletedAt: new Date(),
            updatedAt: new Date(),
        }).where(eq(comments.id, id_num));
        if (!comment.deletedAt) {
            const hotConfig = await profileAsync(c, 'comment_delete_hot_config', () => getHotConfig(serverConfig));
            await profileAsync(c, 'comment_delete_hot_score', () =>
                adjustFeedDynamicHotScore(db, comment.feedId, comment.parentId ? -hotConfig.replyWeight : -hotConfig.commentWeight)
            );
        }
        return c.text('OK');
    });

    return app;
}

function buildReplyTarget(comment: any, commentById: Map<number, any>) {
    if (!comment.replyToId && !comment.replyToContent) {
        return null;
    }

    const target = comment.replyToId ? commentById.get(comment.replyToId) : null;
    if (target) {
        const deleted = Boolean(target.deletedAt);
        return {
            id: target.id,
            content: deleted ? null : target.content,
            deleted,
        };
    }

    return {
        id: null,
        content: null,
        deleted: true,
    };
}
