import React from 'react';
import {Box, Dialog, DialogContent, DialogTitle, IconButton, Typography} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LanguageIcon from '@mui/icons-material/Language';
import HubIcon from '@mui/icons-material/Hub';
import RouterIcon from '@mui/icons-material/Router';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import WifiIcon from '@mui/icons-material/Wifi';
import DataObjectIcon from '@mui/icons-material/DataObject';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import MicIcon from '@mui/icons-material/Mic';
import {ConnectionStatus, ConnectedRoom} from './useRoom';

type Tone = 'ok' | 'soft' | 'warn' | 'bad' | 'muted';
const colors: Record<Tone, string> = {ok: '#8ec07c', soft: '#a89984', warn: '#d79921', bad: '#cc241d', muted: '#928374'};
const bytes = (value: number) => value < 1024 ? `${value.toFixed(0)} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
const rate = (value: number) => `${bytes(value)}/s`;
const latencyTone = (value?: number): Tone => value === undefined ? 'muted' : value <= 80 ? 'ok' : value <= 180 ? 'soft' : value <= 300 ? 'warn' : 'bad';
const stateTone = (value: string): Tone => value === 'connected' || value === 'open' ? 'ok' : value === 'failed' || value === 'closed' ? 'bad' : 'warn';

const Card = ({icon, title, detail, value, tone = 'muted'}: {icon: React.ReactNode; title: string; detail: string; value: string; tone?: Tone}) => <Box sx={{minWidth: 0, p: 1.35, border: '1px solid #504945', borderRadius: 1.5, bgcolor: '#3c3836', display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr) auto', columnGap: 1, alignItems: 'center'}}>
    <Box sx={{color: colors[tone], display: 'flex'}}>{icon}</Box>
    <Box sx={{minWidth: 0}}><Typography sx={{fontWeight: 700, fontSize: '.91rem', lineHeight: 1.25}}>{title}</Typography><Typography noWrap variant="caption" sx={{display: 'block', color: '#bdae93', lineHeight: 1.4}}>{detail}</Typography></Box>
    <Typography sx={{pl: 1, color: colors[tone], fontWeight: 800, fontSize: '.9rem', whiteSpace: 'nowrap'}}>{value}</Typography>
</Box>;

export const ConnectionStatusPanel = ({open, onClose, status, room}: {open: boolean; onClose: () => void; status: ConnectionStatus; room: ConnectedRoom}) => {
    const wsOpen = status.websocketState === 'open';
    const hasTurn = status.peers.some((peer) => peer.route === 'turn');
    const hasDirect = status.peers.some((peer) => peer.route === 'direct');
    const dataReady = status.peers.some((peer) => peer.dataChannelState === 'open');
    const mediaUpload = status.peers.reduce((total, peer) => total + peer.uploadBps, 0);
    const mediaDownload = status.peers.reduce((total, peer) => total + peer.downloadBps, 0);
    const lossPeers = status.peers.filter((peer) => peer.packetLossRate !== undefined);
    const packetLoss = lossPeers.length ? lossPeers.reduce((total, peer) => total + (peer.packetLossRate ?? 0), 0) / lossPeers.length : undefined;
    const mode = room.mode === 'local' ? 'Local' : room.mode === 'stun' ? 'STUN' : 'TURN';
    const mediaTone: Tone = packetLoss !== undefined && packetLoss > .03 ? 'bad' : packetLoss !== undefined && packetLoss > .01 ? 'warn' : status.peers.length ? 'ok' : 'muted';

    return <Dialog open={open} onClose={onClose} fullWidth maxWidth="md"><Box sx={{bgcolor: 'background.paper', color: 'text.primary', border: '1px solid #504945', borderRadius: 2}}>
        <DialogTitle sx={{px: 2.5, py: 2, display: 'flex', alignItems: 'center'}}><WifiIcon sx={{mr: 1, color: '#a89984'}}/><Box sx={{flex: 1}}><Typography variant="h6" sx={{fontWeight: 800}}>连接状态</Typography><Typography variant="caption" sx={{color: '#bdae93'}}>实时数据 · 每秒刷新</Typography></Box><IconButton aria-label="关闭连接状态" onClick={onClose} sx={{color: '#ebdbb2'}}><CloseIcon/></IconButton></DialogTitle>
        <DialogContent sx={{px: 2.5, pb: 2.5, overflowY: 'auto', maxHeight: 'calc(82vh - 96px)'}}>
            <Typography variant="overline" sx={{color: '#928374', fontWeight: 700}}>连接概览</Typography>
            <Box sx={{display: 'grid', gridTemplateColumns: {xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))'}, gap: 1, mb: 1.75}}>
                <Card icon={<HubIcon fontSize="small"/>} title="房间 WebSocket" detail={wsOpen ? '信令连接已建立' : `状态：${status.websocketState}`} value={wsOpen ? '已连接' : '已断开'} tone={wsOpen ? 'ok' : 'bad'}/>
                <Card icon={<LanguageIcon fontSize="small"/>} title="服务器请求" detail="HTTP 往返探测" value={status.serverLatencyMs === undefined ? '—' : `${status.serverLatencyMs} ms`} tone={latencyTone(status.serverLatencyMs)}/>
                <Card icon={<RouterIcon fontSize="small"/>} title="房间模式" detail={mode === 'Local' ? '局域网直连' : mode === 'STUN' ? '直连优先' : '允许 TURN 中继'} value={mode} tone="soft"/>
                <Card icon={<SyncAltIcon fontSize="small"/>} title="实际媒体路径" detail={hasTurn ? '媒体经 TURN 中继' : hasDirect ? '媒体正在直连' : '等待 ICE 选路'} value={hasTurn ? 'TURN' : hasDirect ? '直连' : '待检测'} tone={hasTurn ? 'warn' : hasDirect ? 'ok' : 'muted'}/>
            </Box>
            <Typography variant="overline" sx={{color: '#928374', fontWeight: 700}}>媒体与质量</Typography>
            <Box sx={{display: 'grid', gridTemplateColumns: {xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))'}, gap: 1, mb: 1.75}}>
                <Card icon={<ScreenShareIcon fontSize="small"/>} title="屏幕共享" detail={room.hostStream?.getVideoTracks().length ? '本机正在发送画面' : `接收 ${room.clientStreams.length} 路媒体`} value={room.hostStream?.getVideoTracks().length ? '开启' : '关闭'} tone={room.hostStream?.getVideoTracks().length ? 'ok' : 'muted'}/>
                <Card icon={<MicIcon fontSize="small"/>} title="麦克风" detail={room.microphoneActive ? (room.microphoneMuted ? '已静音' : '正在发送声音') : '未启用'} value={room.microphoneActive ? (room.microphoneMuted ? '静音' : '开启') : '关闭'} tone={room.microphoneActive && !room.microphoneMuted ? 'ok' : 'muted'}/>
                <Card icon={<SyncAltIcon fontSize="small"/>} title="媒体码率" detail={`上行 ${rate(mediaUpload)} · 下行 ${rate(mediaDownload)}`} value={status.peers.length ? '实时' : '—'} tone={status.peers.length ? 'ok' : 'muted'}/>
                <Card icon={<WifiIcon fontSize="small"/>} title="媒体丢包率" detail="汇总活跃 P2P 对端" value={packetLoss === undefined ? '—' : `${(packetLoss * 100).toFixed(2)}%`} tone={mediaTone}/>
                <Card icon={<DataObjectIcon fontSize="small"/>} title="数据通道" detail={dataReady ? `↑ ${rate(status.dataChannelUploadBps)} · ↓ ${rate(status.dataChannelDownloadBps)}` : '暂无已打开的通道'} value={dataReady ? '已就绪' : '—'} tone={dataReady ? 'ok' : 'muted'}/>
            </Box>
            {status.peers.length > 0 && <><Typography variant="overline" sx={{color: '#928374', fontWeight: 700}}>P2P 对端（{status.peers.length}）</Typography><Box sx={{display: 'grid', gap: .75}}>{status.peers.map((peer) => {
                const name = room.users.find((user) => user.id === peer.peerID)?.name ?? '未知对端';
                const tone = peer.connectionState === 'connected' ? latencyTone(peer.rttMs) : stateTone(peer.connectionState);
                return <Card key={peer.id} icon={<WifiIcon fontSize="small"/>} title={name} detail={`WebRTC ${peer.connectionState} · ICE ${peer.iceState} · ${peer.route === 'turn' ? 'TURN 中继' : peer.route === 'direct' ? '直连' : '路径待定'} · 丢包 ${peer.packetLossRate === undefined ? '—' : `${(peer.packetLossRate * 100).toFixed(2)}%`}`} value={peer.rttMs === undefined ? '—' : `${peer.rttMs} ms`} tone={tone}/>;
            })}</Box></>}
        </DialogContent>
    </Box></Dialog>;
};
