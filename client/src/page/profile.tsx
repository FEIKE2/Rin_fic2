import { t } from "i18next";
import { useContext, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ButtonWithLoading } from "../components/button";
import { client } from "../app/runtime";
import { ImageUploadInput } from "../components/image-upload-input";
import { Input } from "../components/input";
import { ProfileContext } from "../state/profile";


export function ProfilePage() {
    const profile = useContext(ProfileContext);
    const [, setLocation] = useLocation();
    const [username, setUsername] = useState('');
    const [avatar, setAvatar] = useState('');
    const [bio, setBio] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        if (profile === undefined) return;
        if (profile === null) { setLocation('/login'); return; }
        setUsername(profile.name || '');
        setAvatar(profile.avatar || '');
        // Load bio from public profile
        client.publicUser.get(profile.id).then(({ data }) => {
            if (data) setBio(data.bio || '');
        });
    }, [profile, setLocation]);

    const handleSubmit = async () => {
        if (!username.trim()) { setError(t('profile.error.empty_username')); return; }
        setIsLoading(true); setError(''); setSuccess('');
        try {
            const { error: apiError } = await client.user.updateProfile({
                username: username.trim(),
                avatar: avatar || null,
                bio: bio.slice(0, 60),
            } as any);
            if (apiError) { setError(t('profile.error.update_failed')); setIsLoading(false); return; }
            setSuccess(t('profile.success'));
            setTimeout(() => window.location.reload(), 1000);
        } catch { setError(t('profile.error.network')); }
        finally { setIsLoading(false); }
    };

    if (profile === undefined) return <div className="py-8 px-4 my-32 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-theme" /></div>;
    if (profile === null) return null;

    return (
        <div className="py-8 px-4 my-8">
            <div className="max-w-2xl mx-auto bg-w rounded-2xl shadow-lg p-8">
                <h1 className="text-2xl font-bold mb-8 t-primary">{t('profile.title')}</h1>
                {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
                {success && <p className="text-sm text-green-500 mb-4">{success}</p>}
                <div className="space-y-6">
                    <div className="flex flex-col items-start space-y-4">
                        <label className="text-sm font-medium t-secondary">{t('profile.avatar')}</label>
                        <div className="w-full max-w-xl">
                            <ImageUploadInput value={avatar} onChange={(v) => { setError(''); setAvatar(v); }} onError={setError} disabled={isLoading} shape="circle" maxFileSize={2 * 1024 * 1024} placeholder={t('upload.image.url_placeholder')} />
                        </div>
                        <p className="text-left text-xs t-secondary">{t('profile.avatar_hint')}</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium t-secondary">{t('profile.username')}</label>
                        <Input value={username} setValue={setUsername} placeholder={t('profile.username_placeholder')} disabled={isLoading} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium t-secondary">{t('profile.bio')}</label>
                        <textarea
                            value={bio}
                            onChange={e => setBio(e.target.value.slice(0, 60))}
                            placeholder={t('profile.bio_placeholder')}
                            disabled={isLoading}
                            maxLength={60}
                            rows={2}
                            className="w-full rounded-xl border border-black/10 bg-w px-4 py-3 text-sm t-primary outline-none transition-colors placeholder:text-neutral-400 focus:border-black/20 dark:border-white/10 dark:placeholder:text-neutral-500 dark:focus:border-white/20 resize-none"
                        />
                        <p className="text-xs text-neutral-400">{bio.length}/60</p>
                    </div>
                    <div className="pt-4">
                        <ButtonWithLoading title={isLoading ? t('profile.saving') : t('profile.save')} onClick={handleSubmit} loading={isLoading} />
                    </div>
                </div>
            </div>
        </div>
    );
}
