import { sql } from "drizzle-orm";
import { feeds, info } from "../db/schema";
import { listContentImageUrls } from "../utils/image";

export const HOT_CONFIG_DEFAULTS = {
    wordWeightPer1000: 50,
    wordScoreMax: 150,
    imageWeight: 20,
    imageScoreMax: 60,
    uniqueVisitWeight: 1.5,
    likeWeight: 5,
    bookmarkWeight: 10,
    commentWeight: 20,
    replyWeight: 8,
    dailyDecay: 0.9057236643,
};

type ConfigReader = {
    getOrDefault<T>(key: string, defaultValue: T): Promise<T>;
};

export type HotConfig = typeof HOT_CONFIG_DEFAULTS;

export async function getHotConfig(serverConfig: ConfigReader): Promise<HotConfig> {
    return {
        wordWeightPer1000: await getConfigNumber(serverConfig, "hot.word_weight_per_1000", HOT_CONFIG_DEFAULTS.wordWeightPer1000),
        wordScoreMax: await getConfigNumber(serverConfig, "hot.word_score_max", HOT_CONFIG_DEFAULTS.wordScoreMax),
        imageWeight: await getConfigNumber(serverConfig, "hot.image_weight", HOT_CONFIG_DEFAULTS.imageWeight),
        imageScoreMax: await getConfigNumber(serverConfig, "hot.image_score_max", HOT_CONFIG_DEFAULTS.imageScoreMax),
        uniqueVisitWeight: await getConfigNumber(serverConfig, "hot.unique_visit_weight", HOT_CONFIG_DEFAULTS.uniqueVisitWeight),
        likeWeight: await getConfigNumber(serverConfig, "hot.like_weight", HOT_CONFIG_DEFAULTS.likeWeight),
        bookmarkWeight: await getConfigNumber(serverConfig, "hot.bookmark_weight", HOT_CONFIG_DEFAULTS.bookmarkWeight),
        commentWeight: await getConfigNumber(serverConfig, "hot.comment_weight", HOT_CONFIG_DEFAULTS.commentWeight),
        replyWeight: await getConfigNumber(serverConfig, "hot.reply_weight", HOT_CONFIG_DEFAULTS.replyWeight),
        dailyDecay: await getConfigNumber(serverConfig, "hot.daily_decay", HOT_CONFIG_DEFAULTS.dailyDecay),
    };
}

async function getConfigNumber(serverConfig: ConfigReader, key: string, defaultValue: number) {
    const value = await serverConfig.getOrDefault<unknown>(key, defaultValue);
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return defaultValue;
}

export function calculateContentHotScore(content: string, config: HotConfig) {
    const textLength = Array.from(content.replace(/\s+/g, "")).length;
    const wordScore = Math.min(Math.floor(textLength / 1000) * config.wordWeightPer1000, config.wordScoreMax);
    const imageScore = Math.min(listContentImageUrls(content).length * config.imageWeight, config.imageScoreMax);
    return wordScore + imageScore;
}

export async function updateFeedContentHotScore(db: any, serverConfig: ConfigReader, feedId: number, content: string) {
    const config = await getHotConfig(serverConfig);
    const hotContentScore = calculateContentHotScore(content, config);
    await db.update(feeds)
        .set({
            hotContentScore,
            hotScore: sql`${hotContentScore} + ${feeds.hotDynamicScore}`,
        })
        .where(sql`${feeds.id} = ${feedId}`);
}

export async function adjustFeedDynamicHotScore(db: any, feedId: number, delta: number) {
    if (!Number.isFinite(delta) || delta === 0) {
        return;
    }

    await db.update(feeds)
        .set({
            hotDynamicScore: sql`max(0, ${feeds.hotDynamicScore} + ${delta})`,
            hotScore: sql`${feeds.hotContentScore} + max(0, ${feeds.hotDynamicScore} + ${delta})`,
        })
        .where(sql`${feeds.id} = ${feedId}`);
}

export async function decayFeedHotScores(db: any, serverConfig: ConfigReader) {
    const today = new Date().toISOString().slice(0, 10);
    const lastDecay = await db.query.info.findFirst({
        where: sql`${info.key} = 'hot.last_decay_utc_date'`,
    });

    if (lastDecay?.value === today) {
        return false;
    }

    const config = await getHotConfig(serverConfig);
    await db.update(feeds)
        .set({
            hotDynamicScore: sql`floor(max(0, ${feeds.hotDynamicScore}) * ${config.dailyDecay})`,
            hotScore: sql`${feeds.hotContentScore} + floor(max(0, ${feeds.hotDynamicScore}) * ${config.dailyDecay})`,
        });
    await db.insert(info)
        .values({ key: "hot.last_decay_utc_date", value: today })
        .onConflictDoUpdate({
            target: info.key,
            set: { value: today },
        });
    return true;
}
