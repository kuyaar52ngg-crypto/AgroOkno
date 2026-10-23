/// <reference types="node" />
// Построение PDF с кириллицей (pdf-lib + шрифт Onest под OFL из templates/fonts).
// Все документы помечены плашкой «УЧЕБНЫЙ ДОКУМЕНТ».
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { templatesDir } from './templates';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.39, 0.45, 0.55);
const BRAND = rgb(0.12, 0.23, 0.54);
const LINE = rgb(0.89, 0.91, 0.94);

export interface PdfCtx {
  doc: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
}

async function font(file: string): Promise<Uint8Array> {
  return readFile(path.join(templatesDir(), 'fonts', file));
}

export async function createPdf(title: string): Promise<PdfCtx> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setCreator('АгроОкно');
  const regular = await doc.embedFont(await font('Onest-Regular.ttf'), { subset: true });
  const bold = await doc.embedFont(await font('Onest-SemiBold.ttf'), { subset: true });
  const page = doc.addPage(A4);
  const ctx: PdfCtx = { doc, page, regular, bold, y: A4[1] - MARGIN };

  // Плашка «УЧЕБНЫЙ ДОКУМЕНТ».
  const label = 'УЧЕБНЫЙ ДОКУМЕНТ';
  const w = bold.widthOfTextAtSize(label, 11);
  page.drawText(label, { x: (A4[0] - w) / 2, y: ctx.y, size: 11, font: bold, color: BRAND });
  ctx.y -= 28;
  return ctx;
}

export function heading(ctx: PdfCtx, text: string, size = 20): void {
  const w = ctx.bold.widthOfTextAtSize(text, size);
  ctx.page.drawText(text, { x: Math.max(MARGIN, (A4[0] - w) / 2), y: ctx.y, size, font: ctx.bold, color: INK });
  ctx.y -= size + 10;
}

export function subtitle(ctx: PdfCtx, text: string): void {
  const w = ctx.regular.widthOfTextAtSize(text, 11);
  ctx.page.drawText(text, { x: (A4[0] - w) / 2, y: ctx.y, size: 11, font: ctx.regular, color: MUTED });
  ctx.y -= 26;
}

export function rule(ctx: PdfCtx): void {
  ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + 6 }, end: { x: A4[0] - MARGIN, y: ctx.y + 6 }, thickness: 0.8, color: LINE });
  ctx.y -= 10;
}

export function sectionTitle(ctx: PdfCtx, text: string): void {
  ctx.y -= 6;
  ctx.page.drawText(text, { x: MARGIN, y: ctx.y, size: 12.5, font: ctx.bold, color: INK });
  ctx.y -= 20;
}

/** Строка «подпись — значение» (значение прижато вправо). */
export function pair(ctx: PdfCtx, label: string, value: string): void {
  const size = 11.5;
  ctx.page.drawText(label, { x: MARGIN, y: ctx.y, size, font: ctx.regular, color: MUTED });
  const w = ctx.bold.widthOfTextAtSize(value, size);
  ctx.page.drawText(value, { x: A4[0] - MARGIN - w, y: ctx.y, size, font: ctx.bold, color: INK });
  ctx.y -= 8;
  rule(ctx);
  ctx.y -= 4;
}

/** Абзац с переносом по словам. */
export function paragraph(ctx: PdfCtx, text: string, opts: { size?: number; muted?: boolean } = {}): void {
  const size = opts.size ?? 11.5;
  const f = ctx.regular;
  const maxWidth = A4[0] - 2 * MARGIN;
  const words = text.split(/\s+/);
  let line = '';
  const flush = () => {
    ctx.page.drawText(line, { x: MARGIN, y: ctx.y, size, font: f, color: opts.muted ? MUTED : INK });
    ctx.y -= size + 5;
  };
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (f.widthOfTextAtSize(next, size) > maxWidth && line) {
      flush();
      line = word;
    } else line = next;
  }
  if (line) flush();
  ctx.y -= 4;
}

export async function finish(ctx: PdfCtx): Promise<Buffer> {
  return Buffer.from(await ctx.doc.save());
}

export function pdfResponse(file: Buffer, name: string): Response {
  return new Response(new Uint8Array(file), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name.replace(/[^ -~]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}
