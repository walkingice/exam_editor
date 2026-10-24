import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResizableImage } from './ResizableImage';

beforeEach(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, width: 200, height: 100, top: 0, left: 0, right: 200,
    bottom: 100, toJSON: () => ({}),
  });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(editable = true) {
  const onResize = vi.fn();
  const view = render(<div className="exam-image"><ResizableImage src="image.png"
    alt="Example" widthMm={50} editable={editable} onResize={onResize} /></div>);
  Object.defineProperty(view.container.firstChild, 'clientWidth', { value: 400 });
  const handle = screen.queryByRole('button', { name: '拖曳調整圖片大小' });
  if (handle) handle.setPointerCapture = vi.fn();
  return { onResize, handle: handle!, wrapper: screen.getByRole('img').parentElement! };
}

describe('image resizing', () => {
  it('previews a drag and persists its physical width only on release', () => {
    const { handle, wrapper, onResize } = setup();
    fireEvent.pointerDown(handle, { button: 0, clientX: 200 });
    fireEvent.pointerMove(handle, { clientX: 300 });
    expect(wrapper.style.width).toBe('300px');
    expect(onResize).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { clientX: 300 });
    expect(onResize).toHaveBeenCalledOnce();
    expect(onResize.mock.calls[0][0]).toBeCloseTo(300 * 25.4 / 96);
  });

  it.each([[1000, 400], [-1000, 16]])('bounds the width for pointer %s', (x, width) => {
    const { handle, onResize } = setup();
    fireEvent.pointerDown(handle, { button: 0, clientX: 200 });
    fireEvent.pointerUp(handle, { clientX: x });
    expect(onResize).toHaveBeenCalledOnce();
    expect(onResize.mock.calls[0][0]).toBeCloseTo(width * 25.4 / 96);
  });

  it.each(['pointerCancel', 'lostPointerCapture'] as const)('discards %s drags', (event) => {
    const { handle, wrapper, onResize } = setup();
    fireEvent.pointerDown(handle, { button: 0, clientX: 200 });
    fireEvent.pointerMove(handle, { clientX: 300 });
    fireEvent[event](handle);
    fireEvent.pointerUp(handle, { clientX: 300 });
    expect(wrapper.style.width).toBe('50mm');
    expect(onResize).not.toHaveBeenCalled();
  });

  it('keeps saved dimensions without exposing a handle in read-only mode', () => {
    const { handle, wrapper } = setup(false);
    expect(handle).toBeNull();
    expect(wrapper.style.width).toBe('50mm');
  });
});
