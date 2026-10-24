import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_PAGE_SETTINGS } from '../../domain/types';
import { PageSettingsForm } from './PageSettingsForm';

afterEach(cleanup);

it('applies valid settings and shows invalid input without committing it', () => {
  const onChange = vi.fn();
  const view = render(<PageSettingsForm settings={DEFAULT_PAGE_SETTINGS} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('紙張'), { target: { value: 'A4' } });
  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_PAGE_SETTINGS, paperSize: 'A4' });
  view.rerender(<PageSettingsForm settings={{ ...DEFAULT_PAGE_SETTINGS, paperSize: 'A4' }}
    onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('左邊距 (mm)'), { target: { value: '200' } });
  expect(screen.getByRole('alert')).toHaveTextContent('頁面設定超出允許範圍');
  expect(onChange).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('左邊距 (mm)'), { target: { value: '20' } });
  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_PAGE_SETTINGS, paperSize: 'A4',
    marginsMm: { ...DEFAULT_PAGE_SETTINGS.marginsMm, left: 20 } });
  expect(screen.queryByRole('alert')).toBeNull();
});

it('switches between single and double columns, including legacy settings', () => {
  const onChange = vi.fn();
  const settings = { ...DEFAULT_PAGE_SETTINGS, columns: undefined };
  const view = render(<PageSettingsForm settings={settings} onChange={onChange} />);
  expect(screen.getByLabelText('欄數')).toHaveValue('1');
  fireEvent.change(screen.getByLabelText('欄數'), { target: { value: '2' } });
  expect(onChange).toHaveBeenLastCalledWith({ ...settings, columns: 2 });
  view.rerender(<PageSettingsForm settings={{ ...settings, columns: 2 }} onChange={onChange} />);
  fireEvent.change(screen.getByLabelText('欄數'), { target: { value: '1' } });
  expect(onChange).toHaveBeenLastCalledWith({ ...settings, columns: 1 });
});
