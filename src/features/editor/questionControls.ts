import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

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

function checkbox(view: EditorView, id: string): HTMLElement {
  const label = document.createElement('label');
  label.className = 'question-control';
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
  return label;
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
              (view) => checkbox(view, id), {
                key: `question-${id}-${item.attrs.selected}-${this.editor.isEditable}`,
                side: -1,
                stopEvent: () => true,
              }));
          });
        });
        return DecorationSet.create(state.doc, widgets);
      },
    } })];
  },
});
