import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView, NodeView } from '@tiptap/pm/view';
import { itemControl } from './questionControls';

const tags: Record<string, string> = {
  paragraph: 'p', heading: 'h1', listItem: 'div', table: 'table',
  blockquote: 'blockquote', codeBlock: 'pre',
};

export function itemNodeView(view: EditorView, node: ProseMirrorNode,
  getPos: () => number | undefined): NodeView {
  const type = node.type.name;
  const position = getPos();
  const topLevel = !!node.attrs.id && position !== undefined
    && view.state.doc.resolve(position).depth === (type === 'listItem' ? 1 : 0);
  const semantic = document.createElement(type === 'heading' ? `h${node.attrs.level}` : tags[type]);
  const outer = !topLevel && type !== 'listItem' ? semantic
    : document.createElement(type === 'listItem' ? 'li' : 'div');
  const shell = type === 'listItem' ? document.createElement('div') : outer;
  const border = document.createElement('div');
  border.className = 'document-item-border';
  const contentDOM = type === 'codeBlock' ? document.createElement('code')
    : type === 'table' ? document.createElement('tbody')
      : type === 'paragraph' && !topLevel ? document.createElement('span') : semantic;
  if (contentDOM !== semantic) semantic.append(contentDOM);
  border.append(semantic);
  if (topLevel) {
    shell.classList.add('document-item-shell');
    shell.append(itemControl(view, node.attrs.id, type === 'listItem'), border);
    if (shell !== outer) {
      outer.classList.add('document-question-item');
      outer.append(shell);
    }
  } else if (outer !== semantic) outer.append(semantic);

  const updateAttrs = (current: ProseMirrorNode) => {
    if (current.attrs.id) outer.setAttribute('data-node-id', current.attrs.id);
    if (current.attrs.listStyle) outer.setAttribute('data-list-style', current.attrs.listStyle);
    else outer.removeAttribute('data-list-style');
    semantic.style.textAlign = current.attrs.textAlign ?? '';
    semantic.style.marginBottom = current.attrs.spacingAfterMm
      ? `${current.attrs.spacingAfterMm}mm` : '';
    const checkbox = outer.querySelector<HTMLInputElement>('.document-item-control input');
    if (checkbox) checkbox.checked = current.attrs.selected !== false;
  };
  updateAttrs(node);
  return { dom: outer, contentDOM, update: (current) => {
    if (current.type !== node.type || (type === 'heading' && current.attrs.level !== node.attrs.level)) return false;
    if (current.attrs.id !== node.attrs.id) return false;
    const currentPosition = getPos();
    if (currentPosition === undefined) return false;
    const currentTopLevel = !!current.attrs.id
      && view.state.doc.resolve(currentPosition).depth === (type === 'listItem' ? 1 : 0);
    if (currentTopLevel !== topLevel) return false;
    updateAttrs(current);
    return true;
  }, stopEvent: (event) => !!(event.target instanceof Element
    && event.target.closest('.document-item-control')) };
}
