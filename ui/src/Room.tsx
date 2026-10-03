import React, {useCallback} from 'react';
import {Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Paper, Tooltip, Typography, Slider, Stack} from '@mui/material';
import CancelPresentationIcon from '@mui/icons-material/CancelPresentation';
import PresentToAllIcon from '@mui/icons-material/PresentToAll';
import FullScreenIcon from '@mui/icons-material/Fullscreen';
import VolumeMuteIcon from '@mui/icons-material/VolumeOff';
import VolumeIcon from '@mui/icons-material/VolumeUp';
import SettingsIcon from '@mui/icons-material/Settings';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DescriptionIcon from '@mui/icons-material/Description';
import DrawIcon from '@mui/icons-material/Draw';
import SlideshowIcon from '@mui/icons-material/Slideshow';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import {useHotkeys} from 'react-hotkeys-hook';
import {Video} from './Video';
import {makeStyles} from 'tss-react/mui';
import {ConnectedRoom} from './useRoom';
import {useSnackbar} from 'notistack';
import {useSettings, VideoDisplayMode} from './settings';
import {SettingDialog} from './SettingDialog';
import {i18n} from './i18n';
import {CollaborationPanel} from './CollaborationPanel';
import {UseRoom} from './useRoom';
import {SharedPlayback} from './SharedPlayback';
import {CollaborationWorkspace} from './CollaborationWorkspace';
import {ConnectionStatusPanel} from './ConnectionStatusPanel';

const HostStream: unique symbol = Symbol('mystream');

interface FullScreenHTMLVideoElement extends HTMLVideoElement {
    msRequestFullscreen?: () => void;
    mozRequestFullScreen?: () => void;
    webkitRequestFullscreen?: () => void;
}

const requestFullscreen = (element: FullScreenHTMLVideoElement | null) => {
    if (element?.requestFullscreen) {
        element.requestFullscreen();
    } else if (element?.mozRequestFullScreen) {
        element.mozRequestFullScreen();
    } else if (element?.msRequestFullscreen) {
        element.msRequestFullscreen();
    } else if (element?.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
    }
};

export const Room = ({
    state,
    share,
	startCamera,
	toggleMicrophone,
	connectionStatus,
	leaveRoom,
    stopShare,
    setName,
    sendRoomMessage,
    setMediaSeat,
    admin,
	offerFile,
	acceptFile,
	rejectFile,
	startPlayback,
	stopPlayback,
}: {
    state: ConnectedRoom;
    share: () => void;
	startCamera: () => void;
	startMicrophone: () => void;
	toggleMicrophone: () => void;
	connectionStatus: UseRoom['connectionStatus'];
	leaveRoom: () => void;
    stopShare: () => void;
	startPlayback: UseRoom['startPlayback'];
	stopPlayback: UseRoom['stopPlayback'];
    setName: (name: string) => void;
} & Pick<UseRoom, 'sendRoomMessage' | 'setMediaSeat' | 'admin' | 'offerFile' | 'acceptFile' | 'rejectFile'>) => {
    const {classes} = useStyles();
    const [open, setOpen] = React.useState(false);
    const {enqueueSnackbar} = useSnackbar();
    const [settings, setSettings] = useSettings();
    const [showControl, setShowControl] = React.useState(true);
    const [hoverControl, setHoverControl] = React.useState(false);
    const [selectedStream, setSelectedStream] = React.useState<string | typeof HostStream>();
    const [playbackBlocked, setPlaybackBlocked] = React.useState(false);
    const [videoElement, setVideoElement] = React.useState<FullScreenHTMLVideoElement | null>(null);
	const [tool, setTool] = React.useState<'file' | 'playback' | 'document' | 'canvas' | null>(null);
	const [localPlaybackActive, setLocalPlaybackActive] = React.useState(false);
	const [connectionStatusOpen, setConnectionStatusOpen] = React.useState(false);
	const fileInput = React.useRef<HTMLInputElement>(null);

    const contentStreams = React.useMemo(() => state.clientStreams.filter((item) => item.kind !== 'voice'), [state.clientStreams]);

    useShowOnMouseMovement(setShowControl);

    const handleFullscreen = useCallback(() => requestFullscreen(videoElement), [videoElement]);

    React.useEffect(() => {
        if (selectedStream === HostStream && state.hostStream) {
            return;
        }
        if (contentStreams.some(({id}) => id === selectedStream)) {
            return;
        }
        if (contentStreams.length === 0 && selectedStream) {
            setSelectedStream(undefined);
            return;
        }
        setSelectedStream(contentStreams[0]?.id);
    }, [contentStreams, selectedStream, state.hostStream]);

    const stream =
        selectedStream === HostStream
            ? state.hostStream
            : contentStreams.find(({id}) => selectedStream === id)?.stream;

    React.useEffect(() => {
        if (videoElement && stream) {
            videoElement.srcObject = stream;
            videoElement.muted = selectedStream === HostStream;
            setPlaybackBlocked(false);
            videoElement.play().catch((err) => {
                console.log('无法播放主视频', err);
                setPlaybackBlocked(true);
                if (err.name === 'NotAllowedError') {
                    videoElement.muted = true;
                    videoElement
                        .play()
                        .catch((retryErr) =>
                            console.log('静音模式下仍无法播放', retryErr)
                        );
                }
            });
        }
    }, [videoElement, stream, selectedStream]);

    const copyLink = () => {
        navigator?.clipboard?.writeText(window.location.href)?.then(
            () => enqueueSnackbar(i18n['link_copied'], {variant: 'success'}),
            (err) => enqueueSnackbar(`${i18n['copy_failed']}: ${err}`, {variant: 'error'})
        );
    };

    const setHoverState = React.useMemo(
        () => ({
            onMouseLeave: () => setHoverControl(false),
            onMouseEnter: () => setHoverControl(true),
        }),
        [setHoverControl]
    );

    const controlVisible = showControl || open || hoverControl;

    useHotkeys('s', () => (state.hostStream ? stopShare() : share()), [state.hostStream]);
    useHotkeys(
        'f',
        () => {
            if (selectedStream) {
                handleFullscreen();
            }
        },
        [handleFullscreen, selectedStream]
    );
    useHotkeys('c', copyLink);
    useHotkeys(
        'h',
        () => {
            if (contentStreams !== undefined && contentStreams.length > 0) {
                const currentStreamIndex = contentStreams.findIndex(
                    ({id}) => id === selectedStream
                );
                const nextIndex =
                    currentStreamIndex === contentStreams.length - 1
                        ? 0
                        : currentStreamIndex + 1;
                setSelectedStream(contentStreams[nextIndex].id);
            }
        },
        [contentStreams, selectedStream]
    );
    useHotkeys(
        'l',
        () => {
            if (contentStreams !== undefined && contentStreams.length > 0) {
                const currentStreamIndex = contentStreams.findIndex(
                    ({id}) => id === selectedStream
                );
                const previousIndex =
                    currentStreamIndex === 0
                        ? contentStreams.length - 1
                        : currentStreamIndex - 1;
                setSelectedStream(contentStreams[previousIndex].id);
            }
        },
        [contentStreams, selectedStream]
    );
    useHotkeys(
        'm',
        () => {
            if (videoElement) {
                videoElement.muted = !videoElement.muted;
            }
        },
        [videoElement]
    );

    const videoClasses = () => {
        switch (settings.displayMode) {
            case VideoDisplayMode.FitToWindow:
                return `${classes.video} ${classes.videoWindowFit}`;
            case VideoDisplayMode.OriginalSize:
                return `${classes.video}`;
            case VideoDisplayMode.FitWidth:
                return `${classes.video} ${classes.videoWindowWidth}`;
            case VideoDisplayMode.FitHeight:
                return `${classes.video} ${classes.videoWindowHeight}`;
        }
    };

    return (
        <div className={classes.videoContainer}>
            {playbackBlocked && videoElement && <Button variant="contained" sx={{position: 'absolute', top: '40%', left: '40%', zIndex: 5}} onClick={() => {
                videoElement.muted = selectedStream === HostStream;
                void videoElement.play().then(() => setPlaybackBlocked(false)).catch(() => enqueueSnackbar('播放仍被阻止，请检查浏览器播放权限后重试。', {variant: 'warning'}));
            }}>点击播放并开启声音</Button>}
            {controlVisible && (
                <Paper className={classes.title} elevation={10} {...setHoverState}>
                    <Tooltip title={i18n['copy_link']}>
                        <Typography
                            variant="h4"
                            component="h4"
                            style={{cursor: 'pointer'}}
                            onClick={copyLink}
                        >
                            {state.id}
                        </Typography>
                    </Tooltip>
                </Paper>
            )}

            {stream ? (
                <video
                    ref={setVideoElement}
                    className={videoClasses()}
                    onDoubleClick={handleFullscreen}
                />
            ) : (
                <Typography
                    variant="h4"
                    align="center"
                    component="div"
                    style={{
                        top: '50%',
                        left: '50%',
                        position: 'absolute',
                        transform: 'translate(-50%, -50%)',
                    }}
                >
                    {i18n['no_stream_available']}
                </Typography>
            )}

            {playbackBlocked && videoElement && <Button variant="contained" sx={{position: 'absolute', top: '40%', left: '40%', zIndex: 5}} onClick={() => {
                videoElement.muted = selectedStream === HostStream;
                void videoElement.play().then(() => setPlaybackBlocked(false)).catch(() => enqueueSnackbar('播放仍被阻止，请检查浏览器播放权限后重试。', {variant: 'warning'}));
            }}>点击播放并开启声音</Button>}
            {controlVisible && (
                <Paper className={classes.control} elevation={10} {...setHoverState}>
                    {(stream?.getAudioTracks().length ?? 0) > 0 && videoElement && (
                        <AudioControl video={videoElement} />
                    )}
                    <Box sx={{whiteSpace: 'nowrap'}}>
                        <Tooltip title={state.microphoneActive ? (state.microphoneMuted ? '取消麦克风静音' : '静音麦克风') : '开启麦克风语音'} arrow>
                            <span><IconButton onClick={toggleMicrophone} disabled={!state.users.find((user) => user.you)?.mediaEnabled} size="large">
                                {state.microphoneActive && !state.microphoneMuted ? <MicIcon fontSize="large" /> : <MicOffIcon fontSize="large" />}
                            </IconButton></span>
                        </Tooltip>
                        {state.hostStream ? (
                            <Tooltip title="结束内容共享（保留麦克风语音）" arrow>
                                <IconButton onClick={stopShare} size="large"><CancelPresentationIcon fontSize="large" /></IconButton>
                            </Tooltip>
                        ) : <>
                            <Tooltip title="共享屏幕" arrow><IconButton onClick={share} disabled={!state.users.find((user) => user.you)?.mediaActive} size="large"><PresentToAllIcon fontSize="large" /></IconButton></Tooltip>
                            <Tooltip title="开启摄像头和麦克风" arrow><IconButton onClick={startCamera} disabled={!state.users.find((user) => user.you)?.mediaActive} size="large"><CameraAltIcon fontSize="large" /></IconButton></Tooltip>
                        </>}

						<Tooltip title="同播" arrow><IconButton onClick={() => setTool('playback')} size="large"><SlideshowIcon fontSize="large" /></IconButton></Tooltip>
						<Tooltip title="协作文档" arrow><IconButton onClick={() => setTool('document')} size="large"><DescriptionIcon fontSize="large" /></IconButton></Tooltip>
						<Tooltip title="协同画板" arrow><IconButton onClick={() => setTool('canvas')} size="large"><DrawIcon fontSize="large" /></IconButton></Tooltip>
						<Tooltip title="文件传输" arrow><IconButton onClick={() => setTool('file')} size="large"><AttachFileIcon fontSize="large" /></IconButton></Tooltip>
						<Tooltip title="连接状态" arrow><IconButton onClick={() => setConnectionStatusOpen(true)} size="large"><NetworkCheckIcon fontSize="large" /></IconButton></Tooltip>
						<Tooltip title="退出房间" arrow><IconButton onClick={leaveRoom} size="large" color="warning"><ExitToAppIcon fontSize="large" /></IconButton></Tooltip>

                        <Tooltip title={i18n['fullscreen']} arrow>
                            <IconButton
                                onClick={() => handleFullscreen()}
                                disabled={!selectedStream}
                                size="large"
                            >
                                <FullScreenIcon fontSize="large" />
                            </IconButton>
                        </Tooltip>

                        <Tooltip title={i18n['settings']} arrow>
                            <IconButton onClick={() => setOpen(true)} size="large">
                                <SettingsIcon fontSize="large" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Paper>
            )}

            <Box sx={{position: 'absolute', top: 12, left: 12, zIndex: 2, display: 'flex', flexDirection: 'column', gap: 0.5}}>
                {state.clientStreams.filter((item) => item.kind === 'voice').map((item) => <VoiceAudio key={item.id} stream={item.stream} name={state.users.find((user) => user.id === item.peer_id)?.name ?? '成员'} />)}
            </Box>
            <CollaborationPanel state={state} sendRoomMessage={sendRoomMessage} setMediaSeat={setMediaSeat} admin={admin} />
			<Dialog open={tool !== null} onClose={() => { if (!localPlaybackActive) setTool(null); }} fullWidth maxWidth="md"><DialogTitle>{tool === 'file' ? '文件传输' : tool === 'playback' ? '同播' : tool === 'document' ? '协作文档' : '协同画板'}</DialogTitle><DialogContent>
				{tool === 'playback' && <SharedPlayback state={state} sendRoomMessage={sendRoomMessage} startPlayback={startPlayback} stopPlayback={stopPlayback} onActiveChange={setLocalPlaybackActive} />}
				{(tool === 'document' || tool === 'canvas') && <CollaborationWorkspace state={state} sendRoomMessage={sendRoomMessage} initialTab={tool === 'canvas' ? 1 : 0} hideTriggers />}
				{tool === 'file' && <Box><Button startIcon={<AttachFileIcon />} onClick={() => fileInput.current?.click()}>发送文件给全体</Button><input ref={fileInput} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) offerFile(file, state.users.filter((user) => !user.you).map((user) => user.id)); event.currentTarget.value = ''; }} />{state.fileTransfers.map((file) => <Box key={file.id} sx={{my: 1}}><Typography>{file.name} · {Math.round(file.transferred / 1024)} / {Math.round(file.size / 1024)} KB · {file.state}</Typography>{file.direction === 'incoming' && file.state === 'offered' && <><Button onClick={() => acceptFile(file.id)}>接收</Button><Button onClick={() => rejectFile(file.id)}>拒绝</Button></>}{file.url && <Button href={file.url} download={file.name}>下载</Button>}</Box>)}</Box>}
			</DialogContent></Dialog>
			<ConnectionStatusPanel open={connectionStatusOpen} onClose={() => setConnectionStatusOpen(false)} status={connectionStatus} room={state} />

            <div className={classes.bottomContainer}>
                {contentStreams
                    .filter(({id}) => id !== selectedStream)
                    .map((client) => {
                        return (
                            <Paper
                                key={client.id}
                                elevation={4}
                                className={classes.smallVideoContainer}
                                onClick={() => setSelectedStream(client.id)}
                            >
                                <Video
                                    key={client.id}
                                    src={client.stream}
                                    className={classes.smallVideo}
                                />
                                <Typography
                                    variant="subtitle1"
                                    component="div"
                                    align="center"
                                    className={classes.smallVideoLabel}
                                >
                                    {state.users.find(({id}) => client.peer_id === id)?.name ??
                                        i18n['unknown']}
                                </Typography>
                            </Paper>
                        );
                    })}
                {state.hostStream && selectedStream !== HostStream && (
                    <Paper
                        elevation={4}
                        className={classes.smallVideoContainer}
                        onClick={() => setSelectedStream(HostStream)}
                    >
                        <Video src={state.hostStream} className={classes.smallVideo} />
                        <Typography
                            variant="subtitle1"
                            component="div"
                            align="center"
                            className={classes.smallVideoLabel}
                        >
                            {i18n['you']}
                        </Typography>
                    </Paper>
                )}
                <SettingDialog
                    open={open}
                    setOpen={setOpen}
                    updateName={setName}
                    saveSettings={setSettings}
                />
            </div>
        </div>
    );
};

const VoiceAudio = ({stream, name}: {stream: MediaStream; name: string}) => {
    const audio = React.useRef<HTMLAudioElement>(null);
    const [blocked, setBlocked] = React.useState(false);
    const [muted, setMuted] = React.useState(false);
    const play = () => audio.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    React.useEffect(() => {
        const element = audio.current;
        if (!element) return;
        element.srcObject = stream;
        void play();
        return () => { element.pause(); element.srcObject = null; };
    }, [stream]);
    return <Box>
        <audio ref={audio} muted={muted} />
        <Button size="small" variant="contained" onClick={() => { if (blocked) void play(); else setMuted(!muted); }}>
            {blocked ? `点击收听 ${name} 的语音` : `${name} 语音 · ${muted ? '已静音，点击收听' : '收听中，点击静音'}`}
        </Button>
    </Box>;
};

const useShowOnMouseMovement = (doShow: (s: boolean) => void) => {
    const timeoutHandle = React.useRef(0);

    React.useEffect(() => {
        const update = () => {
            if (timeoutHandle.current === 0) {
                doShow(true);
            }

            clearTimeout(timeoutHandle.current);
            timeoutHandle.current = window.setTimeout(() => {
                timeoutHandle.current = 0;
                doShow(false);
            }, 1000);
        };
        window.addEventListener('mousemove', update);
        return () => window.removeEventListener('mousemove', update);
    }, [doShow]);

    React.useEffect(
        () =>
            void (timeoutHandle.current = window.setTimeout(() => {
                timeoutHandle.current = 0;
                doShow(false);
            }, 1000)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );
};

const AudioControl = ({video}: {video: FullScreenHTMLVideoElement}) => {
    const {enqueueSnackbar} = useSnackbar();
    const resume = () => { void video.play().catch(() => enqueueSnackbar('无法播放声音，请检查浏览器权限后重试。', {variant: 'warning'})); };
    // this is used to force a rerender
    const [, setMuted] = React.useState<boolean>();

    React.useEffect(() => {
        const handler = () => setMuted(video.muted);
        video.addEventListener('volumechange', handler);
        setMuted(video.muted);
        return () => video.removeEventListener('volumechange', handler);
    });

    return (
        <Stack spacing={0.5} direction="row" sx={{alignItems: 'center', my: 1, height: 35, pr: 2}}>
            <IconButton size="large" onClick={() => { video.muted = !video.muted; if (!video.muted) resume(); }}>
                {video.muted ? (
                    <VolumeMuteIcon fontSize="large" />
                ) : (
                    <VolumeIcon fontSize="large" />
                )}
            </IconButton>
            <Slider
                min={0}
                max={1}
                step={0.01}
                defaultValue={video.volume}
                onChange={(_, newVolume) => {
                    video.muted = false;
                    video.volume = newVolume;
                    resume();
                }}
            />
        </Stack>
    );
};

const useStyles = makeStyles()(() => ({
    title: {
        padding: 15,
        position: 'fixed',
        top: '30px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
    },
    bottomContainer: {
        position: 'fixed',
        display: 'flex',
        bottom: 0,
        left: 0,
        zIndex: 20,
    },
    control: {
        padding: 15,
        position: 'fixed',
        bottom: '30px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
    },
    video: {
        display: 'block',
        margin: '0 auto',

        '&::-webkit-media-controls-start-playback-button': {
            display: 'none!important',
        },
        '&::-webkit-media-controls': {
            display: 'none!important',
        },
    },
    smallVideo: {
        minWidth: '100%',
        minHeight: '100%',
        width: 'auto',
        maxWidth: '300px',

        maxHeight: '200px',
    },
    videoWindowFit: {
        width: '100%',
        height: '100%',

        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%,-50%)',
    },
    videoWindowWidth: {
        height: 'auto',
        width: '100%',
    },
    videoWindowHeight: {
        height: '100%',
        width: 'auto',
    },
    smallVideoLabel: {
        position: 'absolute',
        display: 'block',
        bottom: 0,
        background: 'rgba(0,0,0,.5)',
        padding: '5px 15px',
    },
    noMaxWidth: {
        maxWidth: 'none',
    },
    smallVideoContainer: {
        height: '100%',
        padding: 5,
        maxHeight: 200,
        maxWidth: 400,
        width: '100%',
    },
    videoContainer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: '100%',
        height: '100%',

        overflow: 'auto',
    },
}));
