import React from 'react';
import {useSnackbar} from 'notistack';
import {Box, Button, Paper, Slider, Typography} from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import PlayCircleOutlinedIcon from '@mui/icons-material/PlayCircleOutlined';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import {ConnectedRoom, UseRoom} from './useRoom';

type Playback = {action: 'start' | 'play' | 'pause' | 'seek' | 'rate' | 'sync' | 'stop'; currentTime?: number; rate?: number; duration?: number; paused?: boolean};
type CapturableMediaElement = HTMLMediaElement & {captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream};

export const SharedPlayback = ({state, sendRoomMessage, startPlayback, stopPlayback, onActiveChange}: Pick<UseRoom, 'sendRoomMessage' | 'startPlayback' | 'stopPlayback'> & {state: ConnectedRoom; onActiveChange: (active: boolean) => void}) => {
    const {enqueueSnackbar} = useSnackbar();
    const [starting, setStarting] = React.useState(false);
    const startingRef = React.useRef(false);
    const me = state.users.find((user) => user.you);
    const input = React.useRef<HTMLInputElement>(null);
    const media = React.useRef<CapturableMediaElement>(null);
    const [file, setFile] = React.useState<File>();
    const [source, setSource] = React.useState<string>();
    const [ready, setReady] = React.useState(false);
    const [started, setStarted] = React.useState(false);
    const [playing, setPlaying] = React.useState(false);
    const [currentTime, setCurrentTime] = React.useState(0);
    const [duration, setDuration] = React.useState(0);
    const remote = state.playback?.from !== me?.id ? state.playback : undefined;
    const activeStreamer = state.users.find((user) => user.id === state.playback?.from);
    const anotherMemberIsStreaming = Boolean(activeStreamer && !activeStreamer.you);

    const supported = React.useMemo(() => {
        const element = document.createElement('video') as CapturableMediaElement;
        return typeof element.captureStream === 'function' || typeof element.mozCaptureStream === 'function';
    }, []);
    const blockedReason = !supported ? '当前浏览器不支持捕获本地视频或音频，无法发起同播。'
        : !me?.mediaEnabled ? '房主已关闭你的媒体权限。'
        : !me.mediaActive ? `请先进入媒体区；最多 ${state.maxMediaSeats} 人，席位满时需等待成员退出。`
        : anotherMemberIsStreaming ? `${activeStreamer?.name} 正在同播，结束后即可开始同播。`
        : !starting && !started && state.hostStream ? '请先结束自己的屏幕共享或摄像头，再开始同播。' : '';

    React.useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);

    React.useEffect(() => {
        if (started && !state.hostStream) {
            media.current?.pause();
            setStarted(false);
            setPlaying(false);
            onActiveChange(false);
        }
    }, [started, state.hostStream, onActiveChange]);

    const broadcast = (action: Playback['action']) => {
        const player = media.current;
        if (!player || !started || !state.hostStream) return;
        sendRoomMessage('playback', {action, currentTime: player.currentTime, rate: player.playbackRate, duration: Number.isFinite(player.duration) ? player.duration : 0, paused: player.paused} satisfies Playback);
    };
    React.useEffect(() => {
        if (!started) return;
        const timer = window.setInterval(() => broadcast('sync'), 1000);
        return () => window.clearInterval(timer);
    }, [started, state.hostStream, sendRoomMessage]);

    const choose = (next?: File) => {
        if (!next) return;
        if (!next.type.startsWith('audio/') && !next.type.startsWith('video/')) { enqueueSnackbar('请选择浏览器能够识别的音频或视频文件。', {variant: 'warning'}); return; }
        if (source) URL.revokeObjectURL(source);
        setFile(next); setSource(URL.createObjectURL(next)); setReady(false); setStarted(false); setPlaying(false); setCurrentTime(0);
    };
    const begin = async () => {
        if (startingRef.current) return;
        if (blockedReason) { enqueueSnackbar(blockedReason, {variant: 'warning'}); return; }
        const player = media.current;
        const capture = player?.captureStream ?? player?.mozCaptureStream;
        if (!player || !capture) { enqueueSnackbar('当前浏览器无法发起本地文件同播。', {variant: 'error'}); return; }
        startingRef.current = true;
        setStarting(true);
        onActiveChange(true);
        let captured: MediaStream | undefined;
        try {
            await player.play();
            captured = capture.call(player);
            if (!captured.getTracks().some((track) => track.readyState === 'live')) throw new Error('未捕获到可播放的音视频轨道，请更换文件后重试。');
            await startPlayback(captured);
            if (player.ended) { stopPlayback(); throw new Error('文件已播放结束，请重新开始。'); }
            setStarted(true);
            sendRoomMessage('playback', {action: 'start', currentTime: player.currentTime, rate: player.playbackRate, duration: Number.isFinite(player.duration) ? player.duration : 0, paused: player.paused} satisfies Playback);
        } catch (error) {
            player.pause();
            captured?.getTracks().forEach((track) => track.stop());
            onActiveChange(false);
            enqueueSnackbar(`无法开始同播：${error instanceof Error ? error.message : String(error)}`, {variant: 'error'});
        } finally { startingRef.current = false; setStarting(false); }
    };
    const togglePlayback = async () => {
        try { if (media.current?.paused) await media.current.play(); else media.current?.pause(); }
        catch (error) { enqueueSnackbar(`播放失败：${error}`, {variant: 'error'}); }
    };
    const playbackError = () => {
        setReady(false);
        enqueueSnackbar('无法读取或解码该文件，请选择浏览器支持的音视频格式。', {variant: 'error'});
        if (started) end();
        else if (startingRef.current) stopPlayback();
    };
    const end = () => {
        if (!started) return;
        media.current?.pause();
        sendRoomMessage('playback', {action: 'stop'} satisfies Playback);
        stopPlayback(); setStarted(false); onActiveChange(false);
    };
    const formatTime = (value: number) => !Number.isFinite(value) ? '0:00' : `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`;

    return <Paper elevation={0} sx={{p: 2, bgcolor: '#3c3836'}}>
        {remote && <Typography role="status" sx={{mb: 1}}>{state.users.find((user) => user.id === remote.from)?.name ?? '成员'} 正在同播 · {remote.paused ? '已暂停' : '播放中'} · {formatTime(remote.currentTime)} / {formatTime(remote.duration)}（进度定期同步，画面在房间主区域）</Typography>}
        {blockedReason && <Typography role="status" color="warning.main" sx={{mb: 1}}>{blockedReason}</Typography>}
        {!file ? <Box sx={{minHeight: 280, border: '2px dashed #a89984', borderRadius: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, cursor: 'pointer'}} onClick={() => input.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); }}><PlayCircleOutlinedIcon sx={{fontSize: 58}} /><Typography variant="h6">选择本地音频或视频</Typography><Typography color="text.secondary">点击选择或将文件拖到这里，和房间成员一起看或听。</Typography>{anotherMemberIsStreaming && <Typography color="text.secondary">{activeStreamer?.name} 正在同播；结束后即可开始你的同播。</Typography>}<Button variant="contained" startIcon={<FolderOpenIcon />}>选择文件</Button></Box> : <Box>
            {file.type.startsWith('video/') ? <video ref={media as React.RefObject<HTMLVideoElement>} src={source} style={{width: '100%', maxHeight: '52vh', display: 'block', background: '#000'}} onError={playbackError} onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration); setReady(true); }} onPlay={() => { setPlaying(true); broadcast('play'); }} onPause={() => { setPlaying(false); broadcast('pause'); }} onEnded={end} onSeeked={() => broadcast('seek')} onRateChange={() => broadcast('rate')} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} /> : <Box sx={{minHeight: 250, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, background: 'radial-gradient(circle, rgba(168, 153, 132, .32), transparent 55%)'}}><PlayCircleOutlinedIcon sx={{fontSize: 82}} /><Typography>{file.name}</Typography><audio ref={media as React.RefObject<HTMLAudioElement>} src={source} onError={playbackError} onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration); setReady(true); }} onPlay={() => { setPlaying(true); broadcast('play'); }} onPause={() => { setPlaying(false); broadcast('pause'); }} onEnded={end} onSeeked={() => broadcast('seek')} onRateChange={() => broadcast('rate')} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} /></Box>}
            <Box sx={{display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 1, mt: 1}}><Box><Typography noWrap variant="body2">{file.name}</Typography><Slider min={0} max={duration || 1} value={Math.min(currentTime, duration || 1)} onChange={(_, value) => { if (media.current) media.current.currentTime = value as number; setCurrentTime(value as number); }} /><Typography variant="caption">{formatTime(currentTime)} / {formatTime(duration)}</Typography>{anotherMemberIsStreaming && <Typography variant="caption" color="text.secondary" sx={{display: 'block'}}>{activeStreamer?.name} 正在同播，结束后即可开始。</Typography>}</Box>{started ? <Button variant="contained" onClick={() => void togglePlayback()}>{playing ? '暂停' : '播放'}</Button> : <Button variant="contained" disabled={!ready || starting || Boolean(blockedReason)} onClick={() => void begin()}>{starting ? '正在开始…' : '开始同播'}</Button>}{started ? <Button color="error" startIcon={<StopCircleIcon />} onClick={end}>结束同播</Button> : <Button disabled={starting} onClick={() => input.current?.click()}>更换文件</Button>}</Box>
        </Box>}
        <input ref={input} type="file" accept="audio/*,video/*" hidden onChange={(event) => { choose(event.target.files?.[0]); event.currentTarget.value = ''; }} />
    </Paper>;
};
