import {TextField, TextFieldProps} from '@mui/material';
import React from 'react';
import {i18n} from './i18n';

export interface NumberFieldProps {
    value: number;
    min: number;
    onChange: (value: number) => void;
}

export const NumberField = ({
    value,
    min,
    onChange,
    ...props
}: NumberFieldProps & Omit<TextFieldProps, 'value' | 'onChange'>) => {
    const [stringValue, setStringValue] = React.useState<string>(value.toString());
    const [error, setError] = React.useState('');

    return (
        <TextField
            value={stringValue}
            type="number"
            helperText={error}
            error={error !== ''}
            onChange={(event) => {
                setStringValue(event.target.value);
                const i = parseInt(event.target.value, 10);
                if (Number.isNaN(i)) {
                    setError(i18n['invalid_number']);
                    return;
                }

                if (i < min) {
                    setError(`${i18n['number_must_be_at_least']} ${min}`);
                    return;
                }
                onChange(i);
                setError('');
            }}
            {...props}
        />
    );
};
