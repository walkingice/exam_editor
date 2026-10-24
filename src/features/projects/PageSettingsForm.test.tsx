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
