import { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import mammoth from 'mammoth';
import DOMPurify from 'dompurify';
import Dexie from 'dexie';
import { Document } from 'docx';
import { mapExamDocument } from '../features/export-docx/mapDocument';
import { parseDocx } from '../features/import-docx/parseDocx';

export const browserDependencies = {
  Editor,
  EditorContent,
  StarterKit,
  TextAlign,
  Image,
  TableKit,
  mammoth,
  DOMPurify,
  Dexie,
  Document,
  parseDocx,
  mapExamDocument,
};
