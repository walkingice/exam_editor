import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';

const PX_PER_MM = 96 / 25.4;

export function ResizableImage({ src, alt, widthMm, editable, onResize }: {
  src: string; alt: string; widthMm: number | null;
  editable: boolean; onResize: (widthMm: number) => void;
}) {
  const image = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; width: number; max: number } | null>(null);
  const [width, setWidth] = useState<number | null>(null);

  function start(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !image.current) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = image.current.getBoundingClientRect();
    drag.current = { x: event.clientX, width: bounds.width,
      max: Math.min(379 * PX_PER_MM,
        image.current.closest('.exam-image')?.clientWidth || bounds.width) };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function nextWidth(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current!;
    return Math.max(16, Math.min(current.max, current.width + event.clientX - current.x));
  }

  function finish(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const finalWidth = nextWidth(event);
    drag.current = null;
    setWidth(null);
    if (editable) onResize(finalWidth / PX_PER_MM);
  }

  return <span className="resizable-image" style={{ width: width !== null
    ? `${width}px` : widthMm == null ? undefined : `${widthMm}mm` }}>
    <img ref={image} src={src} alt={alt} draggable={false} />
    {editable && <button type="button" className="image-resize-handle"
      contentEditable={false} aria-label="拖曳調整圖片大小" title="拖曳調整圖片大小"
      onPointerDown={start}
      onPointerMove={(event) => { if (drag.current) setWidth(nextWidth(event)); }}
      onPointerUp={finish}
      onPointerCancel={() => { drag.current = null; setWidth(null); }}
      onLostPointerCapture={() => { drag.current = null; setWidth(null); }}
    />}
  </span>;
}
