import {getFromURL, getRoomFromURL} from './useRoomID';
import {Typography} from '@mui/material';
import {LoginForm} from './LoginForm';
import {Box, Button, CircularProgress} from '@mui/material';
import {RoomManage, RoomManageLayout} from './RoomManage';
import {useRoom} from './useRoom';
import {Room} from './Room';
import {UseConfig, useConfig} from './useConfig';

export const Router = () => {
    const config = useConfig();

    if (config.loading) {
        return <Box sx={{p: 4, textAlign: 'center'}}><CircularProgress /><Typography>正在加载房间配置…</Typography></Box>;
    }
    if (config.error) return <Box sx={{p: 4}}><Typography role="alert" color="error">{config.error}</Typography><Button onClick={config.refetch}>重新加载</Button></Box>;
    const joiningRoom = Boolean(getRoomFromURL()) && getFromURL('create') !== 'true';
    if (config.createLoginRequired && !config.loggedIn && !joiningRoom) {
        return (
            <RoomManageLayout version={config.version}>
                <LoginForm config={config} />
            </RoomManageLayout>
        );
    }
    return <RouterLoadedConfig key={`${config.loggedIn}:${config.user}`} config={config} />;
};

const RouterLoadedConfig = ({config}: {config: UseConfig}) => {
    const {room, state, ...other} = useRoom(config);

    if (state) {
        return <Room state={state} {...other} />;
    }

    return <RoomManage room={room} config={config} />;
};
