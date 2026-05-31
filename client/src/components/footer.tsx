import { useContext, useEffect, useRef, useState } from 'react';
import Popup from 'reactjs-popup';
import { useLocation } from 'wouter';
import { ClientConfigContext } from '../state/config';
import { Helmet } from "react-helmet";
import { siteName } from '../utils/constants';
import { useTranslation } from "react-i18next";
import { buildLoginPath, HIDDEN_LOGIN_REDIRECT } from "../utils/auth-redirect";
import { applyThemeColor, normalizeThemeColor } from "../utils/theme-color";
import { HEADER_POPUP_PANEL_CLASS } from "./site-header/shared";

const LS_THEME_COLOR = "user.theme.color";

const THEME_COLOR_OPTIONS = [
  { label: "rose", value: "#fc466b" },
  { label: "violet", value: "#7c3aed" },
  { label: "blue", value: "#2563eb" },
  { label: "teal", value: "#0f766e" },
  { label: "orange", value: "#ea580c" },
];

type ThemeMode = 'light' | 'dark' | 'system';

function Footer() {
    const { t } = useTranslation()
    const [, setLocation] = useLocation()
    const [modeState, setModeState] = useState<ThemeMode>('system');
    const config = useContext(ClientConfigContext);
    const footerHtml = config.get<string>('footer');
    const footerHtmlRef = useRef<HTMLDivElement | null>(null);
    const mountedScriptNodesRef = useRef<HTMLScriptElement[]>([]);
    const loginEnabled = config.getBoolean('login.enabled');
    const [doubleClickTimes, setDoubleClickTimes] = useState(0);

    const [themeColor, setThemeColorState] = useState<string>(() => {
        const stored = localStorage.getItem(LS_THEME_COLOR);
        return normalizeThemeColor(stored || config.get<string>('theme.color') || "#fc466b");
    });

    useEffect(() => {
        const mode = localStorage.getItem('theme') as ThemeMode || 'system';
        setModeState(mode);
        setMode(mode);
    }, [])

    useEffect(() => {
        // Apply user's personal theme color on mount
        const stored = localStorage.getItem(LS_THEME_COLOR);
        if (stored) applyThemeColor(stored);
    }, []);

    useEffect(() => {
        const container = footerHtmlRef.current;
        if (!container) return;
        mountedScriptNodesRef.current.forEach((script) => script.remove());
        mountedScriptNodesRef.current = [];
        container.replaceChildren();
        if (!footerHtml) return;
        const template = document.createElement('template');
        template.innerHTML = footerHtml;
        const scripts = Array.from(template.content.querySelectorAll('script'));
        scripts.forEach((script) => script.remove());
        container.appendChild(template.content.cloneNode(true));
        scripts.forEach((script) => {
            const nextScript = document.createElement('script');
            Array.from(script.attributes).forEach((attribute) => {
                nextScript.setAttribute(attribute.name, attribute.value);
            });
            nextScript.textContent = script.textContent;
            container.appendChild(nextScript);
            mountedScriptNodesRef.current.push(nextScript);
        });
        return () => {
            mountedScriptNodesRef.current.forEach((script) => script.remove());
            mountedScriptNodesRef.current = [];
        };
    }, [footerHtml])

    const setMode = (mode: ThemeMode) => {
        setModeState(mode);
        localStorage.setItem('theme', mode);
        if (mode !== 'system' || (!('theme' in localStorage) && window.matchMedia(`(prefers-color-scheme: ${mode})`).matches)) {
            document.documentElement.setAttribute('data-color-mode', mode);
        } else {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
            if (mediaQuery.matches) {
                document.documentElement.setAttribute('data-color-mode', 'dark');
            } else {
                document.documentElement.setAttribute('data-color-mode', 'light');
            }
        }
        window.dispatchEvent(new Event("colorSchemeChange"));
    };

    function setThemeColor(color: string) {
        const normalized = normalizeThemeColor(color);
        localStorage.setItem(LS_THEME_COLOR, normalized);
        setThemeColorState(normalized);
        applyThemeColor(normalized);
    }

    return (
        <footer>
            <Helmet>
                <link rel="alternate" type="application/rss+xml" title={siteName} href="/rss.xml" />
                <link rel="alternate" type="application/atom+xml" title={siteName} href="/atom.xml" />
                <link rel="alternate" type="application/json" title={siteName} href="/rss.json" />
            </Helmet>
            <div className="flex flex-col mb-8 space-y-2 justify-center items-center t-primary ani-show">
                <div ref={footerHtmlRef} />
                <p className='text-sm text-neutral-500 font-normal link-line'>
                    <span onDoubleClick={() => {
                        if(doubleClickTimes >= 2){
                            setDoubleClickTimes(0)
                            if(!loginEnabled) setLocation(buildLoginPath(HIDDEN_LOGIN_REDIRECT))
                        } else {
                            setDoubleClickTimes(doubleClickTimes + 1)
                        }
                    }}>
                        © {new Date().getFullYear()} Powered by <a className='hover:underline' href="https://github.com/openRin/Rin" target="_blank">Rin</a>
                    </span>
                    {config.getBoolean('rss') && <>
                        <Spliter />
                        <Popup trigger={<button className="hover:underline" type="button">RSS</button>}
                            position="top center" arrow={false} closeOnDocumentClick>
                            <div className="border-card">
                                <p className='font-bold t-primary'>{t('footer.rss')}</p>
                                <p>
                                    <a href='/rss.xml'>RSS</a> <Spliter />
                                    <a href='/atom.xml'>Atom</a> <Spliter />
                                    <a href='/rss.json'>JSON</a>
                                </p>
                            </div>
                        </Popup>
                    </>}
                </p>
                <div className="flex items-center gap-2">
                    {/* 页面颜色按钮 */}
                    <Popup
                        trigger={
                            <button aria-label={t("settings.theme_color.title")} type="button"
                                className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                <span className="h-4 w-4 rounded-full border border-black/10 dark:border-white/10 transition-colors" style={{ backgroundColor: themeColor }} />
                            </button>
                        }
                        position="top center"
                        arrow={false}
                        closeOnDocumentClick
                    >
                        <div className={`${HEADER_POPUP_PANEL_CLASS} min-w-52`}>
                            <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
                                {t("settings.theme_color.title")}
                            </p>
                            <div className="flex flex-wrap gap-2 px-3 pb-3 pt-1">
                                {THEME_COLOR_OPTIONS.map(opt => {
                                    const selected = themeColor === opt.value;
                                    return (
                                        <button key={opt.value} type="button"
                                            onClick={() => setThemeColor(opt.value)}
                                            className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-xs transition-all ${selected ? "border-theme bg-theme/5" : "border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20"}`}>
                                            <span className="h-4 w-4 rounded-full border border-black/10 dark:border-white/10" style={{ backgroundColor: opt.value }} />
                                            <span className="t-primary">{t(`settings.theme_color.options.${opt.label}`)}</span>
                                            {selected && <i className="ri-check-line text-theme text-xs" />}
                                        </button>
                                    );
                                })}
                                <label className="flex items-center gap-2 rounded-xl border border-black/10 px-2 py-1.5 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20 cursor-pointer">
                                    <input type="color" value={themeColor}
                                        onChange={e => setThemeColor(e.target.value)}
                                        className="h-4 w-4 cursor-pointer rounded-full border-0 bg-transparent p-0 appearance-none" />
                                    <span className="text-xs t-primary">{t("settings.theme_color.custom")}</span>
                                </label>
                            </div>
                        </div>
                    </Popup>
                    {/* 明暗调节 */}
                    <div className="inline-flex rounded-full border border-zinc-200 p-[3px] dark:border-zinc-700">
                        <ThemeButton mode='light' current={modeState} label="Toggle light mode" icon="ri-sun-line" onClick={setMode} />
                        <ThemeButton mode='system' current={modeState} label="Toggle system mode" icon="ri-computer-line" onClick={setMode} />
                        <ThemeButton mode='dark' current={modeState} label="Toggle dark mode" icon="ri-moon-line" onClick={setMode} />
                    </div>
                </div>
            </div>
        </footer>
    );
}

function Spliter() {
    return <span className='px-1'>|</span>
}

function ThemeButton({ current, mode, label, icon, onClick }: { current: ThemeMode, label: string, mode: ThemeMode, icon: string, onClick: (mode: ThemeMode) => void }) {
    return (
        <button aria-label={label} type="button" onClick={() => onClick(mode)}
            className={`rounded-inherit inline-flex h-[32px] w-[32px] items-center justify-center border-0 t-primary ${current === mode ? "bg-w rounded-full shadow-xl shadow-light" : ""}`}>
            <i className={`${icon}`} />
        </button>
    )
}

export default Footer;
