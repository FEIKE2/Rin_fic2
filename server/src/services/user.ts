import { Hono } from "hono";
import { and, count, eq, inArray } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { AppContext } from "../core/hono-types";
import { profileAsync } from "../core/server-timing";
import { setJWTCookie } from "../core/hono-middleware";
import { feeds, feedLikes, feedBookmarks, users, visitStats } from "../db/schema";
import {
    BadRequestError,
    ForbiddenError,
    InternalServerError,
    NotFoundError
} from "../errors";

export function UserService(): Hono {
    const app = new Hono();

    // GET /user/github - Redirect to GitHub OAuth
    app.get("/github", async (c: AppContext) => {
        const oauth2 = c.get('oauth2');

        if (!oauth2) {
            throw new BadRequestError('GitHub OAuth is not configured');
        }

        const referer = c.req.header('referer');

        if (!referer) {
            throw new BadRequestError('Referer header is required');
        }

        // Build callback URL from referer
        const refererUrl = new URL(referer);
        const callbackUrl = new URL('/callback', refererUrl.origin);

        setCookie(c, 'redirect_to', callbackUrl.toString(), {
            path: '/',
        });

        const genState = await profileAsync(c, 'user_oauth_state', () => Promise.resolve(oauth2.generateState()));
        setCookie(c, 'state', genState, {
            path: '/',
        });

        return c.redirect(oauth2.createRedirectUrl(genState, "GitHub"), 302);
    });

    // GET /user/github/callback - GitHub OAuth callback
    app.get("/github/callback", async (c: AppContext) => {
        const oauth2 = c.get('oauth2');
        const jwt = c.get('jwt');
        const db = c.get('db');

        if (!oauth2) {
            throw new BadRequestError('GitHub OAuth is not configured');
        }

        const query = c.req.query();
        const stateCookie = getCookie(c, 'state');

        console.log('param_state', query.state);
        console.log('cookie_state', stateCookie);

        // Verify state to prevent CSRF attacks
        if (query.state !== stateCookie) {
            throw new BadRequestError('Invalid state parameter');
        }

        // Clear state cookie
        deleteCookie(c, 'state');

        // Exchange code for access token
        const gh_token = await profileAsync(c, 'user_oauth_authorize', () => oauth2.authorize("GitHub", query.code));
        if (!gh_token) {
            throw new BadRequestError('Failed to authorize with GitHub');
        }

        // Request https://api.github.com/user for user info
        const response = await profileAsync(c, 'user_github_fetch', () => fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${gh_token.accessToken}`,
                Accept: "application/json",
                "User-Agent": "rin"
            },
        }));

        const user: any = await profileAsync(c, 'user_github_parse', () => response.json());
        const profile: {
            openid: string;
            username: string;
            avatar: string;
            permission: number | null;
        } = {
            openid: user.id,
            username: user.name || user.login,
            avatar: user.avatar_url,
            permission: 0
        };

        let authToken: string | undefined;

        // Check if user exists
        const existingUser = await profileAsync(c, 'user_existing_lookup', () => db.query.users.findFirst({
            where: eq(users.openid, profile.openid)
        }));

        if (existingUser) {
            profile.permission = existingUser.permission;
            await profileAsync(c, 'user_existing_update', () => db.update(users).set(profile).where(eq(users.id, existingUser.id)));
            authToken = await profileAsync(c, 'user_existing_token', () => jwt.sign({ id: existingUser.id }));
            setJWTCookie(c, authToken);
            // Store token in cookie for frontend to read (not HttpOnly)
            setCookie(c, 'auth_token', authToken, {
                expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
                path: '/',
                sameSite: 'Lax',
            });
        } else {
            // If no user exists, check if this is the first user
            const anyUserCheck = await profileAsync(c, 'user_first_lookup', () => db.query.users.findMany({ limit: 1 }));
            if (anyUserCheck.length === 0) {
                profile.permission = 1;
            }

            const result = await profileAsync(c, 'user_insert', () => db.insert(users).values(profile).returning({ insertedId: users.id }));
            if (!result || result.length === 0) {
                throw new InternalServerError('Failed to register user');
            }

            authToken = await profileAsync(c, 'user_insert_token', () => jwt.sign({ id: result[0].insertedId }));
            setJWTCookie(c, authToken);
            // Store token in cookie for frontend to read (not HttpOnly)
            setCookie(c, 'auth_token', authToken, {
                expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
                path: '/',
                sameSite: 'Lax',
            });
        }

        const redirectTo = getCookie(c, 'redirect_to');
        const redirect_url = new URL(redirectTo || '/');
        // Add token to URL for frontend to store (for cross-domain auth)
        if (authToken) {
            redirect_url.searchParams.set('token', authToken);
        }
        return c.redirect(redirect_url.toString(), 302);
    });

    // GET /user/profile - Get user profile
    app.get('/profile', async (c: AppContext) => {
        const uid = c.get('uid');
        const db = c.get('db');

        if (!uid) {
            throw new ForbiddenError('Authentication required');
        }

        const user = await profileAsync(c, 'user_profile_lookup', () => db.query.users.findFirst({ where: eq(users.id, uid) }));
        if (!user) {
            throw new NotFoundError('User');
        }

        return c.json({
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            permission: user.permission === 1,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        });
    });

    // POST /user/logout - Logout user
    app.post('/logout', async (c: AppContext) => {
        deleteCookie(c, 'token', {
            path: '/',
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
        });
        deleteCookie(c, 'auth_token', {
            path: '/',
            sameSite: 'Lax',
        });
        return c.json({ success: true });
    });

    // PUT /user/profile - Update user profile
    app.put('/profile', async (c: AppContext) => {
        const uid = c.get('uid');
        const db = c.get('db');
        const body = await profileAsync(c, 'user_profile_parse', () => c.req.json());

        if (!uid) {
            throw new ForbiddenError('Authentication required');
        }

        const { username, avatar, bio } = body as { username?: string; avatar?: string; bio?: string };

        if (!username && !avatar && bio === undefined) {
            throw new BadRequestError('At least one field is required');
        }

        const updateData: { username?: string; avatar?: string; bio?: string } = {};
        if (username) updateData.username = username;
        if (avatar) updateData.avatar = avatar;
        if (bio !== undefined) updateData.bio = bio.slice(0, 60);

        await profileAsync(c, 'user_profile_update', () => db.update(users).set(updateData).where(eq(users.id, uid)));

        return c.json({ success: true });
    });

    // GET /user/:id - Public user profile
    app.get('/:id', async (c: AppContext) => {
        const db = c.get('db');
        const id = parseInt(c.req.param('id'));
        if (isNaN(id)) throw new BadRequestError('Invalid user id');

        const user = await profileAsync(c, 'user_public_lookup', () => db.query.users.findFirst({ where: eq(users.id, id) }));
        if (!user) throw new NotFoundError('User');

        const [feedCount] = await profileAsync(c, 'user_feed_count', () =>
            db.select({ count: count() }).from(feeds).where(and(eq(feeds.uid, id), eq(feeds.draft, 0), eq(feeds.listed, 1)))
        );

        // Sum pv/uv from visitStats for this user's feeds
        const userFeeds = await profileAsync(c, 'user_feeds_ids', () =>
            db.select({ id: feeds.id }).from(feeds).where(and(eq(feeds.uid, id), eq(feeds.draft, 0)))
        );
        const feedIds = userFeeds.map((f: { id: number }) => f.id);

        let totalPv = 0;
        let totalUv = 0;
        if (feedIds.length > 0) {
            const stats = await profileAsync(c, 'user_visit_stats', () =>
                db
                    .select({ pv: visitStats.pv, hllData: visitStats.hllData })
                    .from(visitStats)
                    .where(inArray(visitStats.feedId, feedIds))
            );
            for (const s of stats) {
                totalPv += s.pv ?? 0;
            }
            // UV estimation: sum of HLL counts (approximate)
            const { HyperLogLog } = await import('../utils/hyperloglog');
            for (const s of stats) {
                if (s.hllData) {
                    try {
                        const hll = new HyperLogLog(s.hllData);
                        totalUv += Math.round(hll.count());
                    } catch {}
                }
            }
        }

        return c.json({
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            bio: user.bio || "",
            feedCount: feedCount.count,
            totalPv,
            totalUv,
        });
    });

    return app;
}
