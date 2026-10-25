import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { moveDocumentItem, type DocumentItemTarget } from './moveDocumentItem';

export const questionDragType = 'application/x-exam-question';

export function setDocumentItemDragData(dataTransfer: DataTransfer | null, id: string): void {
  if (!dataTransfer) return;
  dataTransfer.setData(questionDragType, id);
  dataTransfer.effectAllowed = 'move';
  if (typeof dataTransfer.setDragImage === 'function') {
    const blankImage = document.createElement('canvas');
    blankImage.width = 1;
    blankImage.height = 1;
    dataTransfer.setDragImage(blankImage, 0, 0);
  }
}

function documentNodeAt(view: EditorView, id: string) {
  const found: Array<{ position: number; attrs: Record<string, unknown> }> = [];
  view.state.doc.descendants((node, position) => {
    if (node.attrs.id === id) {
      found.push({ position, attrs: node.attrs });
      return false;
    }
    return true;
  });
  return found[0] ?? null;
}

export function itemControl(view: EditorView, id: string, question = false): HTMLElement {
  const control = document.createElement('span');
  control.className = question ? 'document-item-control question-control' : 'document-item-control';
  control.contentEditable = 'false';
  const label = document.createElement('label');
  label.contentEditable = 'false';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('aria-label', `選取${question ? '題目' : '項目'} ${id}`);
  input.checked = documentNodeAt(view, id)?.attrs.selected !== false;
  input.disabled = !view.editable;
  input.addEventListener('change', () => {
    const item = documentNodeAt(view, id);
    if (!view.editable || !item) return;
    view.dispatch(view.state.tr.setNodeMarkup(item.position, undefined,
      { ...item.attrs, selected: input.checked }));
  });
  label.append(input);
  const handle = dragHandle(view, id, `移動${question ? '題目' : '項目'} ${id}`);
  control.append(label);
  if (view.editable) control.append(handle);
  return control;
}

export function deleteDocumentItem(view: EditorView, id: string): void {
  if (!view.editable) return;
  const item = documentNodeAt(view, id);
  if (!item) return;
  const node = view.state.doc.nodeAt(item.position);
  if (!node) return;
  const resolved = view.state.doc.resolve(item.position);
  const parent = resolved.parent;
  const onlyListItem = node.type.name === 'listItem'
    && parent.type.name === 'bulletList' && parent.childCount === 1;
  const from = onlyListItem ? resolved.before(resolved.depth) : item.position;
  const size = onlyListItem ? parent.nodeSize : node.nodeSize;
  view.dispatch(view.state.tr.delete(from, from + size));
}

export function itemActions(view: EditorView, id: string): HTMLElement {
  const actions = document.createElement('span');
  actions.className = 'document-item-actions';
  actions.contentEditable = 'false';
  const ai = document.createElement('button');
  ai.type = 'button';
  ai.textContent = '✨';
  ai.title = `AI 項目 ${id}`;
  ai.setAttribute('aria-label', ai.title);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = '❌';
  remove.title = `刪除項目 ${id}`;
  remove.setAttribute('aria-label', remove.title);
  remove.addEventListener('click', () => deleteDocumentItem(view, id));
  actions.append(ai, remove);
  return actions;
}

export function refreshItemControls(view: EditorView): void {
  view.dom.querySelectorAll<HTMLElement>(
    '.document-item-shell:not(.exam-image) > .document-item-control',
  ).forEach((control) => {
    const shell = control.parentElement;
    const item = control.parentElement?.closest<HTMLElement>('[data-node-id]');
    const id = item?.getAttribute('data-node-id');
    if (id && item) control.replaceWith(itemControl(view, id,
      item.classList.contains('document-question-item')));
    const actions = shell?.querySelector<HTMLElement>(':scope > .document-item-actions');
    if (id && actions) actions.replaceWith(itemActions(view, id));
  });
}

function dragHandle(view: EditorView, id: string, label: string): HTMLButtonElement {
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'question-drag-handle';
  handle.draggable = true;
  handle.disabled = !view.editable;
  handle.setAttribute('aria-label', label);
  handle.title = label;
  handle.addEventListener('dragstart', (event) => {
    if (!view.editable) { event.preventDefault(); return; }
    setDocumentItemDragData(event.dataTransfer, id);
  });
  handle.addEventListener('dragend', clearDocumentItemDropIndicator);
  return handle;
}

function itemPosition(view: EditorView, id: string): number | null {
  let offset = 0;
  for (let index = 0; index < view.state.doc.childCount; index += 1) {
    const node = view.state.doc.child(index);
    if (node.type.name === 'bulletList') {
      let itemOffset = offset + 1;
      for (let itemIndex = 0; itemIndex < node.childCount; itemIndex += 1) {
        const item = node.child(itemIndex);
        if (item.attrs.id === id) return itemOffset;
        itemOffset += item.nodeSize;
      }
    } else if (node.attrs.id === id) return offset;
    offset += node.nodeSize;
  }
  return null;
}

function documentItem(view: EditorView, element: HTMLElement | null): HTMLElement | null {
  let current = element;
  while (current && current !== view.dom) {
    const id = current.getAttribute('data-node-id');
    if (id && itemPosition(view, id) !== null) return current;
    current = current.parentElement;
  }
  return null;
}

type DropLocation = DocumentItemTarget & { element: HTMLElement };

function nearestItemBoundary(view: EditorView, clientY: number): DropLocation | null {
  const items = Array.from(view.dom.querySelectorAll<HTMLElement>('[data-node-id]'))
    .flatMap((element) => {
      const id = element.getAttribute('data-node-id');
      const position = id ? itemPosition(view, id) : null;
      return position === null ? [] : [{ element, position }];
    });
  let nearest: DropLocation | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  items.forEach(({ element, position }) => {
    const bounds = element.getBoundingClientRect();
    const beforeDistance = Math.abs(clientY - bounds.top);
    if (beforeDistance < nearestDistance) {
      nearest = { element, position, placement: 'before' };
      nearestDistance = beforeDistance;
    }
    const afterDistance = Math.abs(clientY - bounds.bottom);
    if (afterDistance < nearestDistance) {
      nearest = { element, position, placement: 'after' };
      nearestDistance = afterDistance;
    }
  });
  return nearest;
}

function dropTarget(view: EditorView, event: DragEvent): DropLocation | null {
  const element = event.target instanceof HTMLElement ? event.target : null;
  const targetElement = documentItem(view, element);
  if (targetElement) {
    const id = targetElement.getAttribute('data-node-id');
    const position = id ? itemPosition(view, id) : null;
    if (position === null) return null;
    const bounds = targetElement.getBoundingClientRect();
    const placement = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
    return { element: targetElement, position, placement };
  }
  return nearestItemBoundary(view, event.clientY);
}

function updateDropIndicator(view: EditorView, event: DragEvent, editor: Editor): void {
  clearDocumentItemDropIndicator();
  const target = dropTarget(view, event);
  if (!target || !view.dom.contains(target.element)) return;
  const bounds = target.element.getBoundingClientRect();
  const gap = 5;
  const y = target.placement === 'before' ? bounds.top - gap : bounds.bottom + gap;
  const marker = document.createElement('div');
  marker.className = 'document-drop-indicator';
  marker.setAttribute('aria-hidden', 'true');
  marker.style.left = `${bounds.left}px`;
  marker.style.top = `${y - 5}px`;
  marker.style.width = `${bounds.width}px`;
  marker.addEventListener('dragover', (dragEvent) => {
    if (!editor.isEditable || !dragEvent.dataTransfer?.types.includes(questionDragType)) return;
    dragEvent.preventDefault();
    dragEvent.dataTransfer.dropEffect = 'move';
  });
  marker.addEventListener('drop', (dropEvent) => {
    const id = dropEvent.dataTransfer?.getData(questionDragType);
    if (!id || !editor.isEditable) return;
    dropEvent.preventDefault();
    moveDocumentItem(editor, id, { position: target.position, placement: target.placement });
    clearDocumentItemDropIndicator();
  });
  document.body.append(marker);
}

export function clearDocumentItemDropIndicator(): void {
  document.querySelectorAll('.document-drop-indicator').forEach((marker) => marker.remove());
}

export const QuestionControls = Extension.create({
  name: 'questionControls',
  addProseMirrorPlugins() {
    return [new Plugin({
      view: () => ({ destroy: clearDocumentItemDropIndicator }),
      props: {
      handleDOMEvents: {
        dragover: (view, event) => {
          if (!this.editor.isEditable || !event.dataTransfer?.types.includes(questionDragType)
            || !dropTarget(view, event)) {
            clearDocumentItemDropIndicator();
            return false;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          updateDropIndicator(view, event, this.editor);
          return true;
        },
        drop: (view, event) => {
          clearDocumentItemDropIndicator();
          const id = event.dataTransfer?.getData(questionDragType);
          if (!id || !this.editor.isEditable) return false;
          event.preventDefault();
          const target = dropTarget(view, event);
          if (target) moveDocumentItem(this.editor, id, {
            position: target.position, placement: target.placement,
          });
          return true;
        },
        dragleave: (view, event) => {
          if (!(event.relatedTarget instanceof Node) || !view.dom.contains(event.relatedTarget)) {
            clearDocumentItemDropIndicator();
          }
          return false;
        },
      },
    } })];
  },
});
