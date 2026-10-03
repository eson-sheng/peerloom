import React from 'react';
import {Box, Button, Collapse, Divider, IconButton, List, ListItem, ListItemText, Paper, TextField, Tooltip, Typography} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PeopleIcon from '@mui/icons-material/People';
import {ConnectedRoom, UseRoom} from './useRoom';

type Props = Pick<UseRoom, 'sendRoomMessage' | 'setMediaSeat' | 'admin'> & {state: ConnectedRoom};

// This panel is intentionally a control-plane UI. It exposes the room limits
// and non-persistent chat now; document, whiteboard and file controls can use
// the same roommessage envelope without changing the signaling transport.
export const CollaborationPanel = ({state, sendRoomMessage, setMediaSeat, admin}: Props) => {
    const [text, setText] = React.useState('');
    const [open, setOpen] = React.useState(true);
	const [showMembers, setShowMembers] = React.useState(false);
    const me = state.users.find((user) => user.you);
    const mediaUsed = state.users.filter((user) => user.mediaActive).length;
    const chats = state.roomMessages.filter((message) => message.kind === 'chat');
    const send = () => {
        const value = text.trim();
        if (!value) return;
        sendRoomMessage('chat', {text: value});
        setText('');
    };

    return <Box sx={{position: 'fixed', right: 16, top: 16, bottom: 16, zIndex: 25, display: 'flex', alignItems: 'center'}}>
        <Collapse in={open} orientation="horizontal" timeout={280} easing="cubic-bezier(0.4, 0, 0.2, 1)">
            <Paper elevation={8} sx={{width: 320, height: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', p: 1.5, gap: 1, bgcolor: 'background.paper', borderRadius: '12px 0 0 12px'}}>
        <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <Typography variant="h6">协作室</Typography>
            <Box>
            {me?.owner && <IconButton aria-label="锁定房间" onClick={() => admin({action: 'lock', locked: !state.locked})}>
                {state.locked ? <LockIcon /> : <LockOpenIcon />}
            </IconButton>}
            <Tooltip title="收起协作栏"><IconButton aria-label="收起协作栏" onClick={() => setOpen(false)}><ChevronRightIcon /></IconButton></Tooltip>
            </Box>
        </Box>
        <Typography variant="body2">房间成员：{state.users.length} / {state.maxMembers ?? '—'}</Typography>
        <Typography variant="body2">屏幕 / 摄像头 / 同播席位：{mediaUsed} / {state.maxMediaSeats ?? '—'}</Typography>
        <Typography variant="caption">所有成员均可语音；同播同时仅限一人。</Typography>
        <Button size="small" variant={me?.mediaActive ? 'outlined' : 'contained'} disabled={!me?.mediaEnabled} startIcon={me?.mediaActive ? <MicOffIcon /> : <MicIcon />} onClick={() => setMediaSeat(!me?.mediaActive)}>
            {me?.mediaActive ? '释放视频席位' : '申请视频席位'}
        </Button>
        <Divider />
        <Button size="small" startIcon={<PeopleIcon />} onClick={() => setShowMembers((current) => !current)}>成员列表（在线 {state.users.length} 人）{state.locked ? ' · 已锁定' : ''}</Button>
        {showMembers && <List dense sx={{maxHeight: 160, overflow: 'auto', py: 0}}>
            {state.users.map((user) => <ListItem key={user.id} secondaryAction={me?.owner && !user.owner ? <Button size="small" color="warning" onClick={() => admin({action: 'kick', target: user.id})}>移除</Button> : undefined}>
                <ListItemText primary={`${user.name}${user.owner ? ' · 房主' : ''}`} secondary={`${user.mediaActive ? '媒体区' : '协作区'} · ${user.streaming ? '共享中' : '在线'}`} />
            </ListItem>)}
        </List>}
        <Divider />
        <Typography variant="subtitle2">聊天（本房间不保存历史）</Typography>
        <Box sx={{flex: 1, overflow: 'auto', minHeight: 80}}>
            {chats.map((message, index) => <Typography key={`${message.at}-${index}`} variant="body2" sx={{mb: .75}}>
                <b>{state.users.find((user) => user.id === message.from)?.name ?? '成员'}：</b>{typeof message.data === 'object' && message.data !== null && 'text' in message.data ? String((message.data as {text: unknown}).text) : ''}
            </Typography>)}
        </Box>
        <Box sx={{display: 'flex', gap: .5}}>
            <TextField size="small" fullWidth value={text} placeholder="输入消息" onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') send(); }} />
            <IconButton color="primary" onClick={send}><SendIcon /></IconButton>
        </Box>
            </Paper>
        </Collapse>
        {!open && <Tooltip title="打开协作栏" placement="left">
            <Paper elevation={8} sx={{borderRadius: '12px 0 0 12px'}}>
                <IconButton aria-label="打开协作栏" onClick={() => setOpen(true)}><ChevronLeftIcon /></IconButton>
            </Paper>
        </Tooltip>}
    </Box>;
};
