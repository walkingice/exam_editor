import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
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

function questionAt(view: EditorView, id: string) {
  let offset = 0;
  for (let index = 0; index < view.state.doc.childCount; index += 1) {
    const node = view.state.doc.child(index);
    if (node.type.name === 'bulletList') {
      let itemOffset = 0;
      for (let itemIndex = 0; itemIndex < node.childCount; itemIndex += 1) {
        const item = node.child(itemIndex);
        if (item.attrs.id === id) {
          return { position: offset + 1 + itemOffset, attrs: item.attrs };
        }
        itemOffset += item.nodeSize;
      }
    }
    offset += node.nodeSize;
  }
  return null;
}

function questionControl(view: EditorView, id: string): HTMLElement {
  const control = document.createElement('span');
  control.className = 'question-control';
  control.contentEditable = 'false';
  const label = document.createElement('label');
  label.contentEditable = 'false';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('aria-label', `選取題目 ${id}`);
  input.checked = questionAt(view, id)?.attrs.selected !== false;
  input.disabled = !view.editable;
  input.addEventListener('change', () => {
    const question = questionAt(view, id);
    if (!view.editable || !question) return;
    view.dispatch(view.state.tr.setNodeMarkup(question.position, undefined,
      { ...question.attrs, selected: input.checked }));
  });
  label.append(input);
  const handle = dragHandle(view, id, `移動題目 ${id}`);
  control.append(label);
  if (view.editable) control.append(handle);
  return control;
}

function dragHandle(view: EditorView, id: string, label: string): HTMLButtonElement {
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'question-drag-handle';
  handle.draggable = true;
  handle.disabled = !view.editable;
  handle.setAttribute('aria-label', label);
  handle.textContent = '↕';
  handle.addEventListener('dragstart', (event) => {
    if (!view.editable) { event.preventDefault(); return; }
    setDocumentItemDragData(event.dataTransfer, id);
  });
  return handle;
}

function itemControl(view: EditorView, id: string): HTMLElement {
  const control = document.createElement('span');
  control.className = 'document-item-control';
  control.contentEditable = 'false';
  if (view.editable) control.append(dragHandle(view, id, `移動項目 ${id}`));
  return control;
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

function dropTarget(view: EditorView, event: DragEvent): DocumentItemTarget | null {
  const element = event.target instanceof HTMLElement ? event.target : null;
  const targetElement = documentItem(view, element);
  if (!targetElement) return null;
  const id = targetElement.getAttribute('data-node-id');
  const position = id ? itemPosition(view, id) : null;
  if (position === null) return null;
  const placement = event.clientY < targetElement.getBoundingClientRect().top
    + targetElement.clientHeight / 2 ? 'before' : 'after';
  return { position, placement };
}

function updateDropIndicator(view: EditorView, event: DragEvent): void {
  clearDropIndicator(view);
  const element = event.target instanceof HTMLElement ? event.target : null;
  const target = dropTarget(view, event);
  const targetElement = documentItem(view, element);
  if (!target || !targetElement || !view.dom.contains(targetElement)) return;
  targetElement.classList.add(`question-drop-${target.placement}`);
}

function clearDropIndicator(view: EditorView): void {
  view.dom.querySelectorAll('.question-drop-before, .question-drop-after')
    .forEach((element) => element.classList.remove(
      'question-drop-before', 'question-drop-after'));
}

export const QuestionControls = Extension.create({
  name: 'questionControls',
  addProseMirrorPlugins() {
    return [new Plugin({ props: {
      decorations: (state) => {
        const widgets: Decoration[] = [];
        state.doc.forEach((node, offset) => {
          if (node.type.name === 'bulletList') {
            node.forEach((item, itemOffset) => {
              const id = item.attrs.id as string;
              widgets.push(Decoration.widget(offset + 2 + itemOffset,
                (view) => questionControl(view, id), {
                  key: `question-${id}-${item.attrs.selected}-${this.editor.isEditable}`,
                  side: -1,
                  stopEvent: () => true,
                }));
            });
          } else if (node.attrs.id && !['image', 'horizontalRule'].includes(node.type.name)) {
            const id = node.attrs.id as string;
            widgets.push(Decoration.widget(offset + 1,
              (view) => itemControl(view, id), {
                key: `item-${id}-${this.editor.isEditable}`,
                side: -1,
                stopEvent: () => true,
              }));
          }
        });
        return DecorationSet.create(state.doc, widgets);
      },
      handleDOMEvents: {
        dragover: (view, event) => {
          if (!this.editor.isEditable || !event.dataTransfer?.types.includes(questionDragType)
            || !dropTarget(view, event)) {
            clearDropIndicator(view);
            return false;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          updateDropIndicator(view, event);
          return true;
        },
        drop: (view, event) => {
          clearDropIndicator(view);
          const id = event.dataTransfer?.getData(questionDragType);
          if (!id || !this.editor.isEditable) return false;
          event.preventDefault();
          const target = dropTarget(view, event);
          if (target) moveDocumentItem(this.editor, id, target);
          return true;
        },
        dragleave: (view, event) => {
          if (!(event.relatedTarget instanceof Node) || !view.dom.contains(event.relatedTarget)) {
            clearDropIndicator(view);
          }
          return false;
        },
      },
    } })];
  },
});
