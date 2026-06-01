import { t } from "i18next";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ButtonWithLoading } from "../components/button";
import { Input } from "../components/input";
import { client, oauth_url } from "../app/runtime";
import { setAuthToken } from "../utils/auth";
import { getLoginRedirectPath } from "../utils/auth-redirect";

export function LoginPage() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [authStatus, setAuthStatus] = useState<{ github: boolean; password: boolean }>({ github: false, password: false });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [mode, setMode] = useState<'choice' | 'password'>('choice');
    const [, setLocation] = useLocation();

    // Fetch auth status on mount
    useEffect(() => {
        client.auth.status().then(({ data }) => {
            if (data) {
                setAuthStatus(data);
            }
        });
    }, []);

    const handleLogin = async () => {
        if (!username || !password) {
            setError(t('login.error.empty'));
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const { data, error: apiError } = await client.auth.login({ username, password });

            if (apiError) {
                setError(t('login.error.invalid'));
                setIsLoading(false);
                return;
            }

            if (data?.success) {
                // Save token to localStorage for cross-domain auth
                if (data.token) {
                    setAuthToken(data.token);
                }
                setLocation(getLoginRedirectPath(window.location.search));
                window.location.reload();
            } else {
                setError(t('login.error.failed'));
            }
        } catch (err) {
            setError(t('login.error.network'));
        } finally {
            setIsLoading(false);
        }
    };

    const choiceButtonClass = "w-full flex flex-row items-center justify-center gap-2 rounded-full px-4 py-3 bg-secondary bg-button t-primary transition-colors";

    return (
        <div className="flex items-center justify-center my-8">
            <div className="bg-w w-full max-w-md flex flex-col items-center justify-between p-8 space-y-4 t-primary rounded-2xl shadow-lg">
                {mode === 'password' ? (
                    <div className="w-full relative flex items-center justify-center">
                        <button
                            type="button"
                            onClick={() => { setMode('choice'); setError(''); }}
                            className="absolute left-0 inline-flex items-center gap-1 text-sm t-secondary hover:text-theme transition-colors"
                        >
                            <i className="ri-arrow-left-line" />
                            <span>{t('login.back')}</span>
                        </button>
                        <p className="text-2xl font-bold">{t('login.title')}</p>
                    </div>
                ) : (
                    <p className="text-2xl font-bold">{t('login.title')}</p>
                )}

                {/* Error message */}
                {error && (
                    <p className="text-sm text-red-500">{error}</p>
                )}

                {/* Choice screen: pick a login method */}
                {mode === 'choice' && (
                    <div className="w-full flex flex-col space-y-3 pt-2">
                        {authStatus.github && (
                            <button
                                type="button"
                                className={choiceButtonClass}
                                onClick={() => { window.location.href = `${oauth_url}`; }}
                            >
                                <i className="ri-github-fill text-xl" />
                                <span>{t('login.with_github')}</span>
                            </button>
                        )}
                        {authStatus.password && (
                            <button
                                type="button"
                                className={choiceButtonClass}
                                onClick={() => { setError(''); setMode('password'); }}
                            >
                                <i className="ri-lock-password-line text-xl" />
                                <span>{t('login.with_password')}</span>
                            </button>
                        )}
                        {!authStatus.github && !authStatus.password && (
                            <p className="text-sm text-red-500 text-center">{t('login.no_methods')}</p>
                        )}
                    </div>
                )}

                {/* Password login form (sub-panel) */}
                {mode === 'password' && authStatus.password && (
                    <>
                        <Input
                            value={username}
                            setValue={setUsername}
                            placeholder={t('login.username.placeholder')}
                            disabled={isLoading}
                            autofocus
                        />
                        <Input
                            value={password}
                            setValue={setPassword}
                            placeholder={t('login.password.placeholder')}
                            type="password"
                            onSubmit={handleLogin}
                            disabled={isLoading}
                        />
                        <div className="flex flex-row items-center space-x-4 pt-2">
                            <ButtonWithLoading
                                title={isLoading ? t("login.loading") : t("login.title")}
                                onClick={handleLogin}
                                loading={isLoading}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
