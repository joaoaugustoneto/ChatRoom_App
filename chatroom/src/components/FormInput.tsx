import { Controller } from 'react-hook-form';
import type { Control, FieldValues, Path } from 'react-hook-form';
import type { TextInputProps } from 'react-native';
import { Input } from './Input';

interface FormInputProps<T extends FieldValues> extends Omit<
  TextInputProps,
  'value' | 'onChangeText'
> {
  control: Control<T>;
  name: Path<T>;
  label: string;
}

// Liga um <Input> ao react-hook-form: valor, onChange e a mensagem de erro
// do Zod aparecem prontos, sem repetir esse código em cada formulário.
export function FormInput<T extends FieldValues>({
  control,
  name,
  label,
  ...rest
}: FormInputProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
        <Input
          label={label}
          value={value ?? ''}
          onChangeText={onChange}
          onBlur={onBlur}
          error={error?.message}
          {...rest}
        />
      )}
    />
  );
}
