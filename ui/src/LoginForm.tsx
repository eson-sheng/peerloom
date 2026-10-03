import {UseConfig} from './useConfig';
import React from 'react';
import {
    Box,
    Button,
    ButtonProps,
    CircularProgress,
    FormControl,
    TextField,
    Typography,
} from '@mui/material';
import {makeStyles} from 'tss-react/mui';
import {green} from '@mui/material/colors';
import {i18n} from './i18n';

export const LoginForm = ({config: {login}, hide}: {config: UseConfig; hide?: () => void}) => {
    const [user, setUser] = React.useState('');
    const [pass, setPass] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const submitting = React.useRef(false);
    const submit = async (event: {preventDefault: () => void}) => {
        event.preventDefault();
        if (submitting.current) return;
        submitting.current = true; setLoading(true); setError('');
        try { await login(user, pass); }
        catch (error) { setError(error instanceof Error ? error.message : '登录失败，请重试。'); }
        finally { submitting.current = false; setLoading(false); }
    };
    return (
        <div>
            <FormControl fullWidth>
                <form onSubmit={submit}>
                    <div style={{display: 'flex', alignItems: 'center'}}>
                        <Typography style={{flex: 1}}>{i18n['login_to_peerloom']}</Typography>
                        {hide ? (
                            <Button variant="outlined" size="small" onClick={hide}>
                                {i18n['go_back']}
                            </Button>
                        ) : undefined}
                    </div>
                    <TextField
                        fullWidth
                        value={user}
                        onChange={(e) => setUser(e.target.value)}
                        label={i18n['username']}
                        size="small"
                        margin="dense"
                    />
                    <TextField
                        fullWidth
                        value={pass}
                        type="password"
                        onChange={(e) => setPass(e.target.value)}
                        label={i18n['password']}
                        size="small"
                        margin="dense"
                    />
                    {error && <Typography role="alert" color="error">{error}</Typography>}
                    <Box sx={{marginTop: 1}}>
                        <LoadingButton
                            type="submit"
                            loading={loading}
                            fullWidth
                            variant="contained"
                        >
                            {i18n['login']}
                        </LoadingButton>
                    </Box>
                </form>
            </FormControl>
        </div>
    );
};

export const LoadingButton = ({loading, children, ...props}: ButtonProps & {loading: boolean}) => {
    const {classes} = useStyles();
    return (
        <Button {...props} disabled={loading}>
            {children}
            {loading && (
                <CircularProgress className={classes.buttonProgress} size={24} color="secondary" />
            )}
        </Button>
    );
};

const useStyles = makeStyles()(() => ({
    buttonProgress: {
        color: green[500],
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: -12,
        marginLeft: -12,
    },
}));
