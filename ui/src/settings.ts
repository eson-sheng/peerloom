import React from 'react';
import {i18n} from './i18n';

export const CodecBestQuality: PreferredCodec = {mimeType: 'BEST_QUALITY'};
export const CodecDefault: PreferredCodec = {mimeType: 'DEFAULT'};

export const preferCodecEquals = (a: PreferredCodec, b: PreferredCodec): boolean => {
    return a.mimeType === b.mimeType && a.sdpFmtpLine === b.sdpFmtpLine;
};

export const codecName = (mimeType: string): string => {
    switch (mimeType) {
        case CodecBestQuality.mimeType:
            return i18n['preset_best_quality'];
        case CodecDefault.mimeType:
            return i18n['preset_browser_default'];
        default:
            return mimeType;
    }
};

export const resolveCodecPlaceholder = (
    codec: PreferredCodec | undefined
): PreferredCodec | undefined => {
    switch (codec?.mimeType) {
        case CodecBestQuality.mimeType:
            return {
                mimeType: 'video/VP9',
                sdpFmtpLine: 'profile-id=2',
            };
        case CodecDefault.mimeType:
            return undefined;
        default:
            return codec;
    }
};

export interface Settings {
    name?: string;
    displayMode: VideoDisplayMode;
    preferCodec?: PreferredCodec;
    framerate: number;
}
export interface PreferredCodec {
    mimeType: string;
    sdpFmtpLine?: string;
}

export enum VideoDisplayMode {
    FitToWindow = 'FitToWindow',
    FitWidth = 'FitWidth',
    FitHeight = 'FitHeight',
    OriginalSize = 'OriginalSize',
}

// 用于 UI 显示的中文标签
export const videoDisplayModeLabel = (mode: VideoDisplayMode): string => {
    switch (mode) {
        case VideoDisplayMode.FitToWindow:
            return i18n['fit_to_window'];
        case VideoDisplayMode.FitWidth:
            return i18n['fit_width'];
        case VideoDisplayMode.FitHeight:
            return i18n['fit_height'];
        case VideoDisplayMode.OriginalSize:
            return i18n['original_size'];
    }
};

const SettingsKey = 'peerloomSettings';

export const loadSettings = (): Settings => {
    const settings: Partial<Settings> = JSON.parse(localStorage.getItem(SettingsKey) ?? '{}') ?? {};

    const defaults: Settings = {
        displayMode: VideoDisplayMode.FitToWindow,
        framerate: 30,
    };

    if (settings && typeof settings === 'object') {
        return {
            name: settings.name?.toString(),
            framerate: settings.framerate ?? defaults.framerate,
            displayMode:
                Object.values(VideoDisplayMode).find((mode) => mode === settings.displayMode) ??
                defaults.displayMode,
            preferCodec: settings.preferCodec ?? CodecDefault,
        };
    }
    return defaults;
};

export const saveSettings = (settings: Settings): void => {
    localStorage.setItem(SettingsKey, JSON.stringify(settings));
};

export const useSettings = (): [Settings, (s: Settings) => void] => {
    const [settings, setSettings] = React.useState(loadSettings);

    return [
        settings,
        (newSettings) => {
            setSettings(newSettings);
            saveSettings(newSettings);
        },
    ];
};
