import {RoomMode, UIConfig} from './message';
import {useSnackbar} from 'notistack';
import React from 'react';
import {urlWithSlash} from './url';
import {i18n} from './i18n';
import {requestJSON} from './request';

export interface UseConfig extends UIConfig {
    login: (username: string, password: string) => Promise<void>;
    refetch: () => void;
    logout: () => Promise<void>;
    loading: boolean;
    error?: string;
}

export const useConfig = (): UseConfig => {
    const {enqueueSnackbar} = useSnackbar();
    const [error, setError] = React.useState<string>();
    const loaded = React.useRef(false);
    const requestVersion = React.useRef(0);
    const [{loading, ...config}, setConfig] = React.useState<UIConfig & {loading: boolean}>({
        authMode: 'all',
        createLoginRequired: true,
        user: 'guest',
        loggedIn: false,
        loading: true,
        version: 'unknown',
        roomName: 'unknown',
        closeRoomWhenOwnerLeaves: true,
    });

    const refetch = React.useCallback(async () => {
        const version = ++requestVersion.current;
        if (!loaded.current) setConfig((current) => ({...current, loading: true}));
        try {
            const data = await requestJSON(`${urlWithSlash}config`);
            if (typeof data.loggedIn !== 'boolean' || typeof data.user !== 'string' || typeof data.createLoginRequired !== 'boolean') throw new Error('房间配置格式不正确，请重试。');
            if (version !== requestVersion.current) return false;
            loaded.current = true;
            setError(undefined);
            setConfig({...data, loading: false});
            return true;
        } catch (error) {
            if (version !== requestVersion.current) return false;
            if (!loaded.current) setError(error instanceof Error ? error.message : '加载配置失败，请重试。');
            setConfig((current) => ({...current, loading: false}));
            return false;
        }
    }, []);

    const login = async (username: string, password: string) => {
        if (!username.trim() || !password) throw new Error('请输入用户名和密码。');
        const body = new FormData();
        body.set('user', username.trim()); body.set('pass', password);
        await requestJSON(`${urlWithSlash}login`, {method: 'POST', body});
        if (!await refetch()) throw new Error('登录请求成功，但账户状态刷新失败，请重试。');
        try { localStorage.setItem('peerloom-auth-changed', String(Date.now())); } catch { /* Focus/poll refresh remains available. */ }
        enqueueSnackbar(i18n['logged_in_success'], {variant: 'success'});
    };

    const logout = async () => {
        try {
            await requestJSON(`${urlWithSlash}logout`, {method: 'POST'}, true);
            requestVersion.current++;
            setConfig((current) => ({...current, loggedIn: false, user: 'guest'}));
            try { localStorage.setItem('peerloom-auth-changed', String(Date.now())); } catch { /* Focus/poll refresh remains available. */ }
            void refetch();
            enqueueSnackbar(i18n['logged_out'], {variant: 'success'});
        } catch (error) { enqueueSnackbar(String(error), {variant: 'error'}); }
    };

    React.useEffect(() => {
        void refetch();
        const refresh = () => { void refetch(); };
        const changed = (event: StorageEvent) => { if (event.key === 'peerloom-auth-changed') refresh(); };
        window.addEventListener('focus', refresh);
        window.addEventListener('storage', changed);
        const timer = window.setInterval(refresh, 60000);
        return () => { requestVersion.current++; window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('storage', changed); };
    }, [refetch]);

    return {...config, refetch, loading, error, login, logout};
};

export const authModeToRoomMode = (authMode: UIConfig['authMode'], loggedIn: boolean): RoomMode => {
    if (loggedIn) {
        return RoomMode.Turn;
    }
    switch (authMode) {
        case 'all':
            return RoomMode.Turn;
        case 'turn':
            return RoomMode.Stun;
        case 'none':
        default:
            return RoomMode.Turn;
    }
};
