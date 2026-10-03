import React from 'react';
import {
    Box,
    Button,
    Checkbox,
    FormControl,
    FormControlLabel,
    Grid,
    Paper,
    TextField,
    Typography,
    Link,
} from '@mui/material';
import {FCreateRoom, UseRoom} from './useRoom';
import {UIConfig} from './message';
import {getRoomFromURL} from './useRoomID';
import {authModeToRoomMode, UseConfig} from './useConfig';
import {LoginForm} from './LoginForm';
import {i18n} from './i18n';

const CreateRoom = ({room, config}: Pick<UseRoom, 'room'> & {config: UIConfig}) => {
    const [id, setId] = React.useState(() => getRoomFromURL() ?? config.roomName);
    const mode = authModeToRoomMode(config.authMode, config.loggedIn);
    const [ownerLeave, setOwnerLeave] = React.useState(config.closeRoomWhenOwnerLeaves);
    const submit = () =>
        room({
            type: 'create',
            payload: {
                mode,
                closeOnOwnerLeave: ownerLeave,
                joinIfExist: true,
                id: id || undefined,
            },
        });
    return (
        <div>
            <FormControl fullWidth>
                <TextField
                    fullWidth
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    label={i18n['id']}
                    margin="dense"
                />
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={ownerLeave}
                            onChange={(_, checked) => setOwnerLeave(checked)}
                        />
                    }
                    label={i18n['close_room_after_you_leave']}
                />
                <Box sx={{paddingBottom: 0.5}}>
                    <Typography>
                        {i18n['nat_traversal_via']}{' '}
                        <Link href="/docs/nat-traversal.md" target="_blank" rel="noreferrer">
                            {mode.toUpperCase()}
                        </Link>
                    </Typography>
                </Box>
                <Button onClick={submit} fullWidth variant="contained">
                    {i18n['create_or_join_room']}
                </Button>
            </FormControl>
        </div>
    );
};

export const RoomManage = ({room, config}: {room: FCreateRoom; config: UseConfig}) => {
    const [showLogin, setShowLogin] = React.useState(false);

    const canCreateRoom = !config.createLoginRequired && config.authMode !== 'all';
    const loginVisible = !config.loggedIn && (showLogin || !canCreateRoom);

    return (
        <RoomManageLayout version={config.version}>
            {loginVisible ? (
                <LoginForm
                    config={config}
                    hide={canCreateRoom ? () => setShowLogin(false) : undefined}
                />
            ) : (
                <>
                    <Typography style={{display: 'flex', alignItems: 'center'}}>
                        <span style={{flex: 1}}>
                            {config.loggedIn
                                ? `${i18n['hello']} ${config.user}！`
                                : '欢迎使用 Peerloom'}
                        </span>{' '}
                        {config.loggedIn ? (
                            <Button variant="outlined" size="small" onClick={config.logout}>
                                {i18n['logout']}
                            </Button>
                        ) : (
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => setShowLogin(true)}
                            >
                                {i18n['login_button']}
                            </Button>
                        )}
                    </Typography>

                    <CreateRoom room={room} config={config} />
                </>
            )}
        </RoomManageLayout>
    );
};

export const RoomManageLayout = ({
    version,
    children,
}: React.PropsWithChildren<{version: string}>) => (
    <Grid
        container={true}
        sx={{justifyContent: 'center'}}
        style={{paddingTop: 50, maxWidth: 400, width: '100%', margin: '0 auto'}}
        spacing={4}
    >
        <Grid size={12}>
            <Typography align="center" gutterBottom>
                <img src="./logo.svg" style={{width: 230}} alt="logo" />
            </Typography>
            <Paper elevation={3} style={{padding: 20}}>
                {children}
            </Paper>
        </Grid>
        <div style={{position: 'absolute', margin: '0 auto', bottom: 0}}>Peerloom {version}</div>
    </Grid>
);
