import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    TextField,
    DialogActions,
    Button,
    Autocomplete,
    Box,
} from '@mui/material';
import {
    CodecBestQuality,
    CodecDefault,
    codecName,
    loadSettings,
    PreferredCodec,
    Settings,
    VideoDisplayMode,
    videoDisplayModeLabel,
} from './settings';
import {NumberField} from './NumberField';
import {i18n} from './i18n';

export interface SettingDialogProps {
    open: boolean;
    setOpen: (open: boolean) => void;
    updateName: (s: string) => void;
    saveSettings: (s: Settings) => void;
}

const getAvailableCodecs = (): PreferredCodec[] => {
    if ('getCapabilities' in RTCRtpSender) {
        return RTCRtpSender.getCapabilities('video')?.codecs ?? [];
    }
    return [];
};

const NativeCodecs = getAvailableCodecs();

export const SettingDialog = ({open, setOpen, updateName, saveSettings}: SettingDialogProps) => {
    const [settingsInput, setSettingsInput] = React.useState(loadSettings);

    const doSubmit = () => {
        saveSettings(settingsInput);
        updateName(settingsInput.name ?? '');
        setOpen(false);
    };

    const {name, preferCodec, displayMode, framerate} = settingsInput;

    return (
        <Dialog open={open} onClose={() => setOpen(false)} maxWidth={'xs'} fullWidth>
            <DialogTitle>{i18n['settings_dialog_title']}</DialogTitle>
            <DialogContent>
                <form onSubmit={doSubmit}>
                    <Box sx={{paddingBottom: 1}}>
                        <TextField
                            autoFocus
                            margin="dense"
                            label={i18n['username']}
                            value={name}
                            onChange={(e) =>
                                setSettingsInput((c) => ({...c, name: e.target.value}))
                            }
                            fullWidth
                        />
                    </Box>
                    {NativeCodecs.length > 0 ? (
                        <Box sx={{paddingY: 1}}>
                            <Autocomplete<PreferredCodec>
                                options={[CodecBestQuality, CodecDefault, ...NativeCodecs]}
                                getOptionLabel={({mimeType, sdpFmtpLine}) =>
                                    codecName(mimeType) + (sdpFmtpLine ? ` (${sdpFmtpLine})` : '')
                                }
                                value={preferCodec}
                                isOptionEqualToValue={(a, b) =>
                                    a.mimeType === b.mimeType && a.sdpFmtpLine === b.sdpFmtpLine
                                }
                                fullWidth
                                onChange={(_, value) =>
                                    setSettingsInput((c) => ({
                                        ...c,
                                        preferCodec: value ?? undefined,
                                    }))
                                }
                                renderInput={(params) => (
                                    <TextField {...params} label={i18n['preferred_codec']} />
                                )}
                            />
                        </Box>
                    ) : undefined}
                    <Box sx={{paddingTop: 1}}>
                        <Autocomplete<VideoDisplayMode>
                            options={Object.values(VideoDisplayMode)}
                            getOptionLabel={videoDisplayModeLabel}
                            onChange={(_, value) =>
                                setSettingsInput((c) => ({
                                    ...c,
                                    displayMode: value ?? VideoDisplayMode.FitToWindow,
                                }))
                            }
                            value={displayMode}
                            fullWidth
                            renderInput={(params) => (
                                <TextField {...params} label={i18n['display_mode']} />
                            )}
                        />
                    </Box>
                    <Box sx={{paddingTop: 1}}>
                        <NumberField
                            label={i18n['frame_rate']}
                            min={1}
                            onChange={(framerate) => setSettingsInput((c) => ({...c, framerate}))}
                            value={framerate}
                            fullWidth
                        />
                    </Box>
                </form>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setOpen(false)} color="primary">
                    {i18n['cancel']}
                </Button>
                <Button onClick={doSubmit} color="primary">
                    {i18n['save']}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
