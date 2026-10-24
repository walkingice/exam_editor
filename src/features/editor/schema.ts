import { Extension, getSchema, wrappingInputRule } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { QuestionControls, setDocumentItemDragData } from './questionControls';

const ExamAttributes = Extension.create({
  name: 'examAttributes',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'listItem', 'table', 'image', 'blockquote',
          'codeBlock', 'horizontalRule'],
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-node-id'),
            renderHTML: ({ id }) => id ? { 'data-node-id': id } : {},
          },
        },
      },
      {
        types: ['listItem'],
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
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'exam-horizontal-rule';
      dom.setAttribute('data-node-id', node.attrs.id);
      const control = document.createElement('span');
      control.className = 'document-item-control';
      control.contentEditable = 'false';
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'question-drag-handle';
      handle.draggable = true;
      handle.setAttribute('aria-label', `移動項目 ${node.attrs.id}`);
      handle.textContent = '↕';
      handle.addEventListener('dragstart', (event) => {
        setDocumentItemDragData(event.dataTransfer, node.attrs.id);
      });
      control.append(handle);
      const rule = document.createElement('hr');
      dom.append(control, rule);
      return { dom };
    };
  },
});

export const examExtensions = [
  StarterKit,
  ExamAttributes,
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
  addInputRules() {
    return [wrappingInputRule({ find: /^1\.\s$/, type: this.editor.schema.nodes.bulletList })];
  },
});

export const editingExtensions = [
  StarterKit.configure({ orderedList: false, horizontalRule: false }),
  ExamHorizontalRule,
  ExamAttributes,
  AssetImage,
  Table,
  TableRow,
  TableCell,
  TableHeader,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  SourceListShortcut,
  QuestionControls,
];
