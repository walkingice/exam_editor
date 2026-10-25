import { Extension, Node, getSchema, wrappingInputRule } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';
import Paragraph from '@tiptap/extension-paragraph';
import Heading from '@tiptap/extension-heading';
import Blockquote from '@tiptap/extension-blockquote';
import CodeBlock from '@tiptap/extension-code-block';
import { ListItem } from '@tiptap/extension-list';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { itemActions, itemControl, QuestionControls } from './questionControls';

const ExamAttributes = Extension.create({
  name: 'examAttributes',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'listItem', 'table', 'image', 'blockquote',
          'codeBlock', 'horizontalRule', 'pageBreak'],
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-node-id'),
            renderHTML: ({ id }) => id ? { 'data-node-id': id } : {},
          },
        },
      },
      {
        types: ['paragraph', 'heading', 'listItem', 'table', 'image', 'blockquote',
          'codeBlock', 'horizontalRule', 'pageBreak'],
        attributes: {
          selected: {
            default: null,
            parseHTML: (element) => {
              const selected = element.getAttribute('data-selected');
              return selected === null ? null : selected === 'true';
            },
            renderHTML: ({ selected }) => selected === null ? {} : { 'data-selected': String(selected) },
          },
        },
      },
      {
        types: ['paragraph', 'heading'],
        attributes: {
          spacingAfterMm: {
            default: 0,
            parseHTML: (element) => Number(element.getAttribute('data-spacing-after-mm') ?? 0),
            renderHTML: ({ spacingAfterMm }) => ({
              'data-spacing-after-mm': spacingAfterMm,
              style: `margin-bottom: ${spacingAfterMm}mm`,
            }),
          },
        },
      },
      {
        types: ['listItem', 'bulletList'],
        attributes: {
          listStyle: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-list-style'),
            renderHTML: ({ listStyle }) => listStyle ? { 'data-list-style': listStyle } : {},
          },
        },
      },
    ];
  },
});

export const AssetImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: { default: null, rendered: false },
      assetId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-asset-id'),
        renderHTML: ({ assetId }) => assetId ? { 'data-asset-id': assetId } : {},
      },
      widthMm: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute('data-width-mm');
          return value === null ? null : Number(value);
        },
        renderHTML: ({ widthMm }) => widthMm == null ? {} : {
          'data-width-mm': widthMm,
          style: `width: ${widthMm}mm`,
        },
      },
    };
  },
});

const ExamHorizontalRule = HorizontalRule.extend({
  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'exam-horizontal-rule';
      dom.classList.add('document-item-shell');
      dom.setAttribute('data-node-id', node.attrs.id);
      const control = itemControl(editor.view, node.attrs.id);
      const border = document.createElement('div');
      border.className = 'document-item-border';
      const rule = document.createElement('hr');
      border.append(rule);
      const host = document.createElement('div');
      host.className = 'ai-item-panel-host';
      host.dataset.aiItemId = node.attrs.id;
      host.contentEditable = 'false';
      border.append(itemActions(editor.view, node.attrs.id), host);
      dom.append(control, border);
      return { dom, update: (updatedNode) => {
        if (updatedNode.type !== node.type || updatedNode.attrs.id !== node.attrs.id) return false;
        const checkbox = dom.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (checkbox) checkbox.checked = updatedNode.attrs.selected !== false;
        return true;
      }, stopEvent: (event) => event.target instanceof Element
        && !!event.target.closest('.document-item-actions, .ai-item-panel'),
      ignoreMutation: (mutation) => mutation.target instanceof Element
        && !!mutation.target.closest('.ai-item-panel-host') };
    };
  },
});

const PageBreak = Node.create({
  name: 'pageBreak', group: 'block', atom: true, selectable: true,
  parseHTML: () => [{ tag: 'div[data-exam-page-break]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes,
    'data-exam-page-break': '', class: 'exam-page-break', contenteditable: 'false' }, '分隔頁'],
  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'document-item-shell exam-page-break';
      dom.dataset.nodeId = node.attrs.id;
      dom.setAttribute('contenteditable', 'false');
      const border = document.createElement('div');
      border.className = 'document-item-border';
      const label = document.createElement('span');
      label.textContent = '分隔頁';
      border.append(label, itemActions(editor.view, node.attrs.id));
      dom.append(itemControl(editor.view, node.attrs.id), border);
      return { dom, update: (current) => {
        if (current.type !== node.type || current.attrs.id !== node.attrs.id) return false;
        const checkbox = dom.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (checkbox) checkbox.checked = current.attrs.selected !== false;
        return true;
      }, stopEvent: (event) => event.target instanceof Element
        && !!event.target.closest('.document-item-control, .document-item-actions') };
    };
  },
});

export const examExtensions = [
  StarterKit,
  ExamAttributes,
  PageBreak,
  AssetImage,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
];

export const examSchema = getSchema(examExtensions);

const SourceListShortcut = Extension.create({
  name: 'sourceListShortcut',
  priority: 1000,
  addInputRules() {
    return [
      wrappingInputRule({ find: /^1\.\s$/, type: this.editor.schema.nodes.bulletList,
        getAttributes: () => ({ listStyle: 'ordered' }) }),
      wrappingInputRule({ find: /^[-*+]\s$/, type: this.editor.schema.nodes.bulletList,
        getAttributes: () => ({ listStyle: 'unordered' }) }),
    ];
  },
});

export const editingExtensions = [
  StarterKit.configure({ orderedList: false, horizontalRule: false, dropcursor: false,
    paragraph: false, heading: false, listItem: false, blockquote: false, codeBlock: false }),
  Paragraph,
  Heading,
  ListItem,
  Blockquote,
  CodeBlock,
  ExamHorizontalRule,
  ExamAttributes,
  PageBreak,
  AssetImage,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  SourceListShortcut,
  QuestionControls,
];
