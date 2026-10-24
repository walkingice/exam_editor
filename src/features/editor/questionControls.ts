import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import { moveQuestion, type QuestionTarget } from './moveQuestion';

const dragType = 'application/x-exam-question';

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
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'question-drag-handle';
  handle.draggable = true;
  handle.disabled = !view.editable;
  handle.setAttribute('aria-label', `移動題目 ${id}`);
  handle.textContent = '↕';
  handle.addEventListener('dragstart', (event) => {
    if (!view.editable || !questionAt(view, id)) { event.preventDefault(); return; }
    event.dataTransfer?.setData(dragType, id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  control.append(label);
  if (view.editable) control.append(handle);
  return control;
}

function dropTarget(view: EditorView, event: DragEvent): QuestionTarget | null {
  const element = event.target instanceof HTMLElement ? event.target : null;
  let item = element?.closest('li');
  while (item && item.parentElement?.parentElement !== view.dom) {
    item = item.parentElement?.closest('li') ?? null;
  }
  if (item?.parentElement?.parentElement === view.dom) {
    const id = item.getAttribute('data-node-id');
    const question = id && questionAt(view, id);
    if (!question) return null;
    const placement = event.clientY < item.getBoundingClientRect().top + item.clientHeight / 2
      ? 'before' : 'after';
    return { position: question.position, placement };
  }
  const heading = element?.closest('h1, h2, h3');
  if (heading?.parentElement !== view.dom) return null;
  const id = heading.getAttribute('data-node-id');
  let position = 0;
  for (let index = 0; index < view.state.doc.childCount; index += 1) {
    const node = view.state.doc.child(index);
    if (node.type.name === 'heading' && node.attrs.id === id) {
      return { position, placement: 'section' };
    }
    position += node.nodeSize;
  }
  return null;
}

export const QuestionControls = Extension.create({
  name: 'questionControls',
  addProseMirrorPlugins() {
    return [new Plugin({ props: {
      decorations: (state) => {
        const widgets: Decoration[] = [];
        state.doc.forEach((node, offset) => {
          if (node.type.name !== 'bulletList') return;
          node.forEach((item, itemOffset) => {
            const id = item.attrs.id as string;
            widgets.push(Decoration.widget(offset + 2 + itemOffset,
              (view) => questionControl(view, id), {
                key: `question-${id}-${item.attrs.selected}-${this.editor.isEditable}`,
                side: -1,
                stopEvent: () => true,
              }));
          });
        });
        return DecorationSet.create(state.doc, widgets);
      },
      handleDOMEvents: {
        dragover: (view, event) => {
          if (!this.editor.isEditable || !event.dataTransfer?.types.includes(dragType)
            || !dropTarget(view, event)) return false;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          return true;
        },
        drop: (view, event) => {
          const id = event.dataTransfer?.getData(dragType);
          if (!id || !this.editor.isEditable) return false;
          event.preventDefault();
          const target = dropTarget(view, event);
          if (target) moveQuestion(this.editor, id, target);
          return true;
        },
      },
    } })];
  },
});
