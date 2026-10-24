import { Extension, getSchema, wrappingInputRule } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';
import { QuestionControls } from './questionControls';

const ExamAttributes = Extension.create({
  name: 'examAttributes',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'listItem', 'table', 'image'],
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
  StarterKit.configure({ orderedList: false }),
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
