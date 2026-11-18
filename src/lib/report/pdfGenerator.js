/**
 * GENESIS Audit-Grade PDF Report Generator
 *
 * Generates a structured, multi-page PDF verification report from persisted
 * database records. Never fabricates evidence, file paths, or line numbers.
 * All data must come from validated database records before calling this module.
 */

import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

// === Color palette (academic professional) ===
const COLOR = {
  navy:         rgb(0.09, 0.19, 0.38),  // primary brand
  navyMid:      rgb(0.14, 0.27, 0.52),
  navyLight:    rgb(0.22, 0.42, 0.72),
  slate:        rgb(0.42, 0.49, 0.58),
  slateLight:   rgb(0.72, 0.78, 0.84),
  slateBg:      rgb(0.95, 0.96, 0.97),
  white:        rgb(1.00, 1.00, 1.00),
  black:        rgb(0.07, 0.07, 0.10),
  bodyText:     rgb(0.18, 0.21, 0.26),
  verified:     rgb(0.06, 0.52, 0.32),
  partial:      rgb(0.60, 0.40, 0.03),
  notImpl:      rgb(0.72, 0.13, 0.17),
  unverified:   rgb(0.35, 0.35, 0.40),
  codeBg:       rgb(0.96, 0.97, 0.98),
  codeBorder:   rgb(0.78, 0.82, 0.88),
  headerBg:     rgb(0.09, 0.19, 0.38),
  divider:      rgb(0.86, 0.89, 0.93),
  accentGold:   rgb(0.80, 0.63, 0.12),
};

// === Margin & typography constants ===
const MARGIN = { top: 72, bottom: 60, left: 56, right: 56 };
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN.left - MARGIN.right;

const FONT_SIZE = {
  cover_title:  26,
  cover_sub:    13,
  h1:           16,
  h2:           13,
  h3:           11,
  body:         9.5,
  small:        8,
  code:         7.5,
  pageNum:      7,
  label:        8,
};

const LINE_HEIGHT = {
  body:    14,
  small:   12,
  code:    11,
  h3:      18,
  h2:      22,
  h1:      28,
};

// Status color and label mapping
function statusConfig(status) {
  switch (status) {
    case 'VERIFIED':              return { color: COLOR.verified,   bg: rgb(0.90, 0.97, 0.93), label: 'VERIFIED' };
    case 'PARTIALLY_IMPLEMENTED': return { color: COLOR.partial,    bg: rgb(0.99, 0.96, 0.87), label: 'PARTIAL' };
    case 'NOT_IMPLEMENTED':       return { color: COLOR.notImpl,    bg: rgb(0.99, 0.91, 0.91), label: 'NOT IMPL.' };
    case 'UNVERIFIED':            return { color: COLOR.unverified, bg: rgb(0.95, 0.95, 0.96), label: 'UNVERIFIED' };
    default:                      return { color: COLOR.slate,      bg: COLOR.slateBg,          label: status || 'UNKNOWN' };
  }
}

/**
 * Sanitizes and normalizes text for reliable WinAnsi encoding in pdf-lib standard fonts.
 * Transliterates special characters, typographical marks, and non-Latin scripts safely
 * to prevent encoding exceptions while preserving content fidelity.
 */
export function sanitizeForPdf(text) {
  if (text === null || text === undefined) return '';
  let str = String(text);

  // Normalizations for typography, arrows, and comparison symbols
  str = str
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u21D2/g, '=>')
    .replace(/\u2264/g, '<=')
    .replace(/\u2265/g, '>=')
    .replace(/\u2260/g, '!=')
    .replace(/[\u2022\u25E6\u2219]/g, '*')
    .replace(/\u00A0/g, ' ');

  const result = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // ASCII printable
    if (code >= 0x20 && code <= 0x7e) {
      result.push(str[i]);
    } else if (code === 0x0a || code === 0x0d || code === 0x09) {
      result.push(str[i]);
    } else if (code >= 0xa0 && code <= 0xff) {
      // Latin-1 Supplement (accented letters, copyright, degree, etc.)
      result.push(str[i]);
    } else if (code === 0x20ac) {
      // Euro symbol
      result.push(str[i]);
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate of surrogate pair (emoji or non-BMP character)
      const high = code;
      const low = str.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        const codePoint = ((high - 0xd800) * 0x400) + (low - 0xdc00) + 0x10000;
        result.push(`[U+${codePoint.toString(16).toUpperCase()}]`);
        i++; // skip low surrogate
      } else {
        result.push('?');
      }
    } else {
      // Non-Latin BMP character (e.g. Devanagari, Cyrillic, CJK, etc.)
      result.push(`[U+${code.toString(16).toUpperCase().padStart(4, '0')}]`);
    }
  }

  return result.join('');
}

// ============================================================
// DocumentContext - stateful page manager
// ============================================================
class DocumentContext {
  constructor(doc, fonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.pages = [];
    this.currentPage = null;
    this.cursor = 0; // y position from top
    this.pageNumber = 0;
  }

  addPage() {
    const page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(page);
    this.currentPage = page;
    this.pageNumber++;
    this.cursor = MARGIN.top;
    return page;
  }

  get y() {
    return PAGE_H - this.cursor;
  }

  ensureSpace(height) {
    if (this.cursor + height > PAGE_H - MARGIN.bottom) {
      this.addPage();
    }
  }

  advance(amount) {
    this.cursor += amount;
  }

  drawFooter(label) {
    const page = this.currentPage;
    const f = this.fonts.regular;
    // Footer line
    page.drawLine({
      start: { x: MARGIN.left, y: MARGIN.bottom },
      end:   { x: PAGE_W - MARGIN.right, y: MARGIN.bottom },
      thickness: 0.5,
      color: COLOR.divider,
    });
    // Left label
    const safeLabel = sanitizeForPdf(label);
    page.drawText(safeLabel, {
      x: MARGIN.left, y: MARGIN.bottom - 12,
      size: FONT_SIZE.pageNum, font: f, color: COLOR.slate,
    });
    // Right page number
    const pnLabel = `Page ${this.pageNumber}`;
    const pnWidth = f.widthOfTextAtSize(pnLabel, FONT_SIZE.pageNum);
    page.drawText(pnLabel, {
      x: PAGE_W - MARGIN.right - pnWidth, y: MARGIN.bottom - 12,
      size: FONT_SIZE.pageNum, font: f, color: COLOR.slate,
    });
  }

  drawText(text, options) {
    this.currentPage.drawText(sanitizeForPdf(text), options);
  }

  drawRect(options) {
    this.currentPage.drawRectangle(options);
  }

  drawLine(options) {
    this.currentPage.drawLine(options);
  }
}

// ============================================================
// Text wrapping helper
// ============================================================
function wrapText(text, font, fontSize, maxWidth) {
  const safeText = sanitizeForPdf(text);
  const words = safeText.replace(/\r\n/g, '\n').split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!word) continue;
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      // If single word is too long, truncate
      let w = word;
      while (font.widthOfTextAtSize(w, fontSize) > maxWidth && w.length > 1) {
        w = w.slice(0, -1);
      }
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Split newlines then wrap each line
function wrapTextMultiline(text, font, fontSize, maxWidth) {
  const result = [];
  for (const para of String(text ?? '').split('\n')) {
    const wrapped = wrapText(para.trim(), font, fontSize, maxWidth);
    if (wrapped.length === 0) result.push('');
    else result.push(...wrapped);
  }
  return result;
}

// ============================================================
// Section header
// ============================================================
function drawSectionHeader(ctx, title, number) {
  ctx.ensureSpace(50);
  ctx.advance(8);

  const page = ctx.currentPage;
  const y = ctx.y;

  // Background bar
  page.drawRectangle({
    x: MARGIN.left, y: y - 24, width: CONTENT_W, height: 24,
    color: COLOR.navy,
    borderWidth: 0,
  });

  // Number badge
  if (number !== undefined) {
    page.drawText(String(number), {
      x: MARGIN.left + 8, y: y - 17,
      size: FONT_SIZE.h2, font: ctx.fonts.bold, color: COLOR.accentGold,
    });
  }

  page.drawText(title, {
    x: MARGIN.left + (number !== undefined ? 28 : 12), y: y - 17,
    size: FONT_SIZE.h2, font: ctx.fonts.bold, color: COLOR.white,
  });

  ctx.advance(32);
}

// Subsection header
function drawSubSectionHeader(ctx, title) {
  ctx.ensureSpace(36);
  ctx.advance(6);

  const y = ctx.y;
  ctx.drawRect({
    x: MARGIN.left, y: y - 2, width: 3, height: 16,
    color: COLOR.navyLight, borderWidth: 0,
  });
  ctx.drawText(title, {
    x: MARGIN.left + 10, y: y - 1,
    size: FONT_SIZE.h3, font: ctx.fonts.bold, color: COLOR.navy,
  });
  ctx.advance(22);
}

// Label-value pair
function drawLabelValue(ctx, label, value, indent = 0) {
  const lWidth = 130;
  const vWidth = CONTENT_W - lWidth - indent;
  const valLines = wrapTextMultiline(value ?? 'N/A', ctx.fonts.regular, FONT_SIZE.body, vWidth);

  ctx.ensureSpace(valLines.length * LINE_HEIGHT.body + 4);
  const y0 = ctx.y;

  ctx.drawText(label, {
    x: MARGIN.left + indent, y: y0,
    size: FONT_SIZE.label, font: ctx.fonts.bold, color: COLOR.slate,
  });

  valLines.forEach((line, i) => {
    ctx.drawText(line, {
      x: MARGIN.left + indent + lWidth, y: y0 - i * LINE_HEIGHT.body,
      size: FONT_SIZE.body, font: ctx.fonts.regular, color: COLOR.bodyText,
    });
  });

  ctx.advance(valLines.length * LINE_HEIGHT.body + 2);
}

// Divider line
function drawDivider(ctx) {
  ctx.ensureSpace(10);
  ctx.advance(4);
  ctx.drawLine({
    start: { x: MARGIN.left, y: ctx.y },
    end:   { x: PAGE_W - MARGIN.right, y: ctx.y },
    thickness: 0.5, color: COLOR.divider,
  });
  ctx.advance(6);
}

// Body paragraph
function drawParagraph(ctx, text, indent = 0, colorOverride) {
  const lines = wrapTextMultiline(text ?? '', ctx.fonts.regular, FONT_SIZE.body, CONTENT_W - indent);
  for (const line of lines) {
    ctx.ensureSpace(LINE_HEIGHT.body + 2);
    ctx.drawText(line, {
      x: MARGIN.left + indent, y: ctx.y,
      size: FONT_SIZE.body, font: ctx.fonts.regular,
      color: colorOverride || COLOR.bodyText,
    });
    ctx.advance(LINE_HEIGHT.body);
  }
}

// Code block
function drawCodeBlock(ctx, code, label) {
  const maxChars = 500;
  const truncated = (code && code.length > maxChars) ? code.slice(0, maxChars) + '...' : (code || '');
  const lines = truncated.split('\n').slice(0, 20); // cap lines

  ctx.ensureSpace(16 + lines.length * LINE_HEIGHT.code + 10);
  ctx.advance(4);

  if (label) {
    ctx.drawText(label, {
      x: MARGIN.left, y: ctx.y,
      size: FONT_SIZE.small, font: ctx.fonts.bold, color: COLOR.slate,
    });
    ctx.advance(13);
  }

  const boxH = lines.length * LINE_HEIGHT.code + 10;
  const boxY = ctx.y - boxH + 4;

  ctx.drawRect({
    x: MARGIN.left, y: boxY, width: CONTENT_W, height: boxH,
    color: COLOR.codeBg, borderColor: COLOR.codeBorder, borderWidth: 0.5,
  });

  lines.forEach((line, i) => {
    const truncLine = line.length > 100 ? line.slice(0, 100) + '…' : line;
    ctx.drawText(truncLine, {
      x: MARGIN.left + 6, y: ctx.y - i * LINE_HEIGHT.code - 1,
      size: FONT_SIZE.code, font: ctx.fonts.mono, color: COLOR.bodyText,
    });
  });

  ctx.advance(boxH + 6);
}

// Status badge inline
function drawStatusBadge(ctx, status, x, y) {
  const cfg = statusConfig(status);
  const label = cfg.label;
  const font = ctx.fonts.bold;
  const fs = FONT_SIZE.small;
  const tw = font.widthOfTextAtSize(label, fs);
  const padH = 6, padV = 3;
  const bw = tw + padH * 2;
  const bh = fs + padV * 2;

  ctx.currentPage.drawRectangle({
    x, y: y - bh + padV, width: bw, height: bh,
    color: cfg.bg, borderColor: cfg.color, borderWidth: 0.6,
  });
  ctx.currentPage.drawText(label, {
    x: x + padH, y: y - 1,
    size: fs, font, color: cfg.color,
  });

  return bw;
}

// ============================================================
// COVER PAGE
// ============================================================
function buildCoverPage(ctx, reportData) {
  const { project, run, submission, srsDoc, reportId, generatedAt } = reportData;
  const page = ctx.addPage();

  // Header band
  page.drawRectangle({
    x: 0, y: PAGE_H - 120, width: PAGE_W, height: 120,
    color: COLOR.navy, borderWidth: 0,
  });

  // Gold accent bar
  page.drawRectangle({
    x: 0, y: PAGE_H - 124, width: PAGE_W, height: 4,
    color: COLOR.accentGold, borderWidth: 0,
  });

  // GENESIS wordmark
  page.drawText('GENESIS', {
    x: MARGIN.left, y: PAGE_H - 55,
    size: 32, font: ctx.fonts.bold, color: COLOR.accentGold,
  });

  page.drawText('An Evidence-Grounded AI Framework for', {
    x: MARGIN.left, y: PAGE_H - 80,
    size: FONT_SIZE.cover_sub, font: ctx.fonts.regular, color: rgb(0.75, 0.82, 0.93),
  });
  page.drawText('Software Requirement Traceability and Implementation Verification', {
    x: MARGIN.left, y: PAGE_H - 96,
    size: FONT_SIZE.cover_sub, font: ctx.fonts.regular, color: rgb(0.75, 0.82, 0.93),
  });

  // Main report title
  page.drawText('Software Requirement Traceability', {
    x: MARGIN.left, y: PAGE_H - 170,
    size: FONT_SIZE.cover_title, font: ctx.fonts.bold, color: COLOR.navy,
  });
  page.drawText('and Implementation Verification Report', {
    x: MARGIN.left, y: PAGE_H - 200,
    size: FONT_SIZE.cover_title, font: ctx.fonts.bold, color: COLOR.navy,
  });

  // Divider
  page.drawLine({
    start: { x: MARGIN.left, y: PAGE_H - 215 }, end: { x: PAGE_W - MARGIN.right, y: PAGE_H - 215 },
    thickness: 1.5, color: COLOR.accentGold,
  });

  // Project name
  page.drawText('Project', {
    x: MARGIN.left, y: PAGE_H - 250,
    size: FONT_SIZE.small, font: ctx.fonts.bold, color: COLOR.slate,
  });
  page.drawText(sanitizeForPdf(project.name || 'Unnamed Project'), {
    x: MARGIN.left, y: PAGE_H - 265,
    size: 18, font: ctx.fonts.bold, color: COLOR.navy,
  });

  if (project.client_name) {
    page.drawText(sanitizeForPdf(`Client: ${project.client_name}`), {
      x: MARGIN.left, y: PAGE_H - 285,
      size: FONT_SIZE.body, font: ctx.fonts.regular, color: COLOR.bodyText,
    });
  }

  // Metadata table on cover
  const metaY = PAGE_H - 340;
  const rows = [
    ['Project ID',           project.id],
    ['Report ID',            reportId],
    ['Verification Run ID',  run.id],
    ['Run Status',           run.status],
    ...(run.base_run_id ? [['Run Lineage', `Upgraded from run ${run.base_run_id}`]] : []),
    ['SRS Document',         srsDoc?.original_name || srsDoc?.filename || 'N/A'],
    ['Source Submission',    submission?.filename || 'N/A'],
    ['Submission Hash',      submission?.archive_hash || 'Not recorded'],
    ['Report Generated',     formatDate(generatedAt)],
  ];

  rows.forEach(([label, value], i) => {
    const ry = metaY - i * 24;
    if (i % 2 === 0) {
      page.drawRectangle({
        x: MARGIN.left, y: ry - 15, width: CONTENT_W, height: 22,
        color: COLOR.slateBg, borderWidth: 0,
      });
    }
    page.drawText(sanitizeForPdf(label), {
      x: MARGIN.left + 8, y: ry - 5,
      size: FONT_SIZE.label, font: ctx.fonts.bold, color: COLOR.slate,
    });
    page.drawText(sanitizeForPdf(String(value ?? 'N/A')), {
      x: MARGIN.left + 160, y: ry - 5,
      size: FONT_SIZE.body, font: ctx.fonts.regular, color: COLOR.bodyText,
    });
  });

  // Bottom disclaimer bar
  const discY = MARGIN.bottom + 20;
  page.drawRectangle({
    x: 0, y: discY - 8, width: PAGE_W, height: 32,
    color: COLOR.slateBg, borderWidth: 0,
  });
  page.drawText(
    'GENESIS performs static source-code inspection and AI-grounded interpretation. ' +
    'This report does not guarantee runtime correctness.',
    {
      x: MARGIN.left, y: discY + 8,
      size: FONT_SIZE.small, font: ctx.fonts.regular, color: COLOR.slate,
    }
  );
}

// ============================================================
// EXECUTIVE SUMMARY
// ============================================================
function buildExecutiveSummary(ctx, reportData, footerLabel) {
  const { project, run, results, submission } = reportData;
  ctx.addPage();
  drawSectionHeader(ctx, 'Executive Summary', '1');

  drawLabelValue(ctx, 'Project', project.name);
  if (project.description) drawLabelValue(ctx, 'Description', project.description);
  if (project.client_name)  drawLabelValue(ctx, 'Client', project.client_name);
  drawLabelValue(ctx, 'Verification Run ID', run.id);
  if (run.base_run_id) {
    drawLabelValue(ctx, 'Run Lineage', `Upgraded from base run ${run.base_run_id}`);
  }
  drawLabelValue(ctx, 'Run Status', run.status);
  drawLabelValue(ctx, 'Run Completed', formatDate(run.completed_at));
  drawDivider(ctx);

  // Status distribution table
  const total = results.length;
  const overriddenCount = results.filter((r) => r.is_overridden).length;
  const counts = {
    VERIFIED: results.filter((r) => (r.effective_status || r.status) === 'VERIFIED').length,
    PARTIALLY_IMPLEMENTED: results.filter((r) => (r.effective_status || r.status) === 'PARTIALLY_IMPLEMENTED').length,
    NOT_IMPLEMENTED: results.filter((r) => (r.effective_status || r.status) === 'NOT_IMPLEMENTED').length,
    UNVERIFIED: results.filter((r) => (r.effective_status || r.status) === 'UNVERIFIED').length,
  };

  drawSubSectionHeader(ctx, 'Verification Status Distribution (Effective)');

  const statuses = ['VERIFIED', 'PARTIALLY_IMPLEMENTED', 'NOT_IMPLEMENTED', 'UNVERIFIED'];
  const labels   = ['Verified', 'Partially Implemented', 'Not Implemented', 'Unverified'];
  const headers  = ['Status', 'Count', 'Percentage'];
  const colW     = [200, 80, 100];
  drawTableHeader(ctx, headers, colW);

  statuses.forEach((status, i) => {
    const count = counts[status];
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    drawTableRow(ctx, [labels[i], String(count), `${pct}%`], colW, status, i);
  });

  // Total row
  ctx.ensureSpace(22);
  const y = ctx.y;
  ctx.drawRect({ x: MARGIN.left, y: y - 15, width: CONTENT_W, height: 20, color: COLOR.navy });
  ctx.drawText('Total Evaluated', { x: MARGIN.left + 6, y: y - 6, size: FONT_SIZE.body, font: ctx.fonts.bold, color: COLOR.white });
  ctx.drawText(String(total), { x: MARGIN.left + colW[0] + 6, y: y - 6, size: FONT_SIZE.body, font: ctx.fonts.bold, color: COLOR.white });
  ctx.drawText('100%', { x: MARGIN.left + colW[0] + colW[1] + 6, y: y - 6, size: FONT_SIZE.body, font: ctx.fonts.bold, color: COLOR.white });
  ctx.advance(22);

  if (overriddenCount > 0) {
    drawLabelValue(ctx, 'Human Overrides', `${overriddenCount} result(s) manually reviewed and adjusted by auditor(s).`);
  }

  // Method Breakdown: AI vs Rules
  const aiCount = run.ai_count || results.filter((r) => (r.method || 'AI') === 'AI').length;
  const rulesCount = run.rules_count || results.filter((r) => r.method === 'RULES').length;
  const aiMode = run.ai_mode || (rulesCount === 0 ? 'LIVE' : aiCount === 0 ? 'RULES_ONLY' : 'DEGRADED');

  ctx.advance(8);
  drawSubSectionHeader(ctx, 'Evaluation Method Breakdown');
  drawLabelValue(ctx, 'Evaluation Mode', aiMode === 'RULES_ONLY' ? 'Base Genesis Model Only (Fallback)' : aiMode === 'DEGRADED' ? 'Degraded (Advance Genesis Model + Base Genesis Model Fallback)' : 'Live Advance Genesis Model');
  drawLabelValue(ctx, 'Advance Genesis Model-Evaluated Requirements', `${aiCount} (${total > 0 ? ((aiCount / total) * 100).toFixed(1) : 0}%)`);
  drawLabelValue(ctx, 'Base Genesis Model-Evaluated Requirements', `${rulesCount} (${total > 0 ? ((rulesCount / total) * 100).toFixed(1) : 0}%)`);

  ctx.advance(10);
  drawParagraph(ctx,
    'Note: "Verification Completion" refers to the percentage of requirements where a conclusive determination (VERIFIED or NOT_IMPLEMENTED) ' +
    'could be made from available static evidence. PARTIALLY_IMPLEMENTED and UNVERIFIED results indicate areas requiring additional ' +
    'inspection or human review. These percentages do not imply runtime software correctness.'
  );

  ctx.drawFooter(footerLabel);
}

// ============================================================
// PROJECT & ANALYSIS INFORMATION
// ============================================================
function buildProjectInfo(ctx, reportData, footerLabel) {
  const { project, run, submission, srsDoc } = reportData;
  ctx.addPage();
  drawSectionHeader(ctx, 'Project and Analysis Information', '2');

  drawSubSectionHeader(ctx, 'Project Details');
  drawLabelValue(ctx, 'Project Name', project.name);
  drawLabelValue(ctx, 'Project ID', project.id);
  drawLabelValue(ctx, 'Project Status', project.status);
  if (project.client_name) drawLabelValue(ctx, 'Client', project.client_name);
  if (project.description)  drawLabelValue(ctx, 'Description', project.description);
  drawLabelValue(ctx, 'Created At', formatDate(project.created_at));
  drawDivider(ctx);

  drawSubSectionHeader(ctx, 'SRS Document');
  if (srsDoc) {
    drawLabelValue(ctx, 'Document Name', srsDoc.original_name || srsDoc.filename);
    drawLabelValue(ctx, 'Document ID', srsDoc.id);
    drawLabelValue(ctx, 'File Size', formatBytes(srsDoc.file_size));
    if (srsDoc.page_count)      drawLabelValue(ctx, 'Pages', String(srsDoc.page_count));
    if (srsDoc.paragraph_count) drawLabelValue(ctx, 'Paragraphs', String(srsDoc.paragraph_count));
    drawLabelValue(ctx, 'Status', srsDoc.status);
  } else {
    drawParagraph(ctx, 'SRS document information is not available for this run.');
  }
  drawDivider(ctx);

  drawSubSectionHeader(ctx, 'Source Submission');
  if (submission) {
    drawLabelValue(ctx, 'Submission Filename', submission.filename);
    drawLabelValue(ctx, 'Submission ID', submission.id);
    drawLabelValue(ctx, 'Archive Size', formatBytes(submission.file_size));
    drawLabelValue(ctx, 'Archive SHA-256', submission.archive_hash || 'Not recorded');
    drawLabelValue(ctx, 'Submission Version', String(submission.version || 1));
    drawLabelValue(ctx, 'Analyzed Files', String(submission.analyzed_files || 0));
    drawLabelValue(ctx, 'Skipped Files', String(submission.skipped_files || 0));
    drawLabelValue(ctx, 'Total Lines', String(submission.total_lines || 0));
    if (submission.languages) {
      try {
        const langs = JSON.parse(submission.languages);
        const langStr = Object.entries(langs).map(([k, v]) => `${k} (${v} files)`).join(', ');
        drawLabelValue(ctx, 'Languages Detected', langStr || 'None');
      } catch {
        drawLabelValue(ctx, 'Languages Detected', 'N/A');
      }
    }
  } else {
    drawParagraph(ctx, 'Source submission information is not available for this run.');
  }
  drawDivider(ctx);

  drawSubSectionHeader(ctx, 'Verification Run Details');
  drawLabelValue(ctx, 'Run ID', run.id);
  drawLabelValue(ctx, 'Run Status', run.status);
  drawLabelValue(ctx, 'Started At', formatDate(run.started_at));
  drawLabelValue(ctx, 'Completed At', formatDate(run.completed_at) || 'Not completed');
  drawLabelValue(ctx, 'Advance Genesis Model', run.model_name || 'Not recorded');
  drawLabelValue(ctx, 'Analysis Version', '1.0.0');
  drawLabelValue(ctx, 'Total Requirements', String(run.total_requirements || 0));

  ctx.drawFooter(footerLabel);
}

// ============================================================
// VERIFICATION METHODOLOGY
// ============================================================
function buildMethodology(ctx, footerLabel) {
  ctx.addPage();
  drawSectionHeader(ctx, 'Verification Methodology', '3');

  drawParagraph(ctx,
    'GENESIS performs evidence-grounded static analysis to assess whether software requirements are ' +
    'reflected in the submitted source code. The following workflow is applied for each verification run:'
  );
  ctx.advance(8);

  const steps = [
    ['1. SRS Document Extraction', 'The SRS document (PDF or DOCX) is parsed server-side. Text is extracted page-by-page or paragraph-by-paragraph.'],
    ['2. Requirement Identification', 'The extracted text is submitted to Advance Genesis Model, which identifies structured requirements. Each extracted requirement is reviewed and approved by the user before proceeding.'],
    ['3. Source-Code ZIP Submission', 'The developer uploads a ZIP archive containing the source code. The archive is validated against magic bytes, size limits, and ZIP Slip attacks.'],
    ['4. Secure Archive Validation', 'The archive is scanned for directory traversal (ZIP Slip), decompression bombs, encryption, symlinks, and malicious entry counts before any extraction begins.'],
    ['5. Bounded Extraction', 'Source files are extracted into an isolated sandbox directory with cumulative size limits. No code is executed at any stage.'],
    ['6. Static Source-Code Analysis', 'Supported file types are analyzed using AST parsing (JavaScript via Babel) or heuristic pattern matching (Python, Java, SQL, HTML). Evidence records are collected including file paths, line numbers, symbols, and code excerpts.'],
    ['7. Evidence Collection', 'All identified code constructs (functions, classes, API endpoints, test references, database operations, authentication indicators, validation constructs) are persisted as immutable evidence records.'],
    ['8. Deterministic Evidence Retrieval', 'For each approved requirement, candidate evidence is retrieved through keyword extraction, identifier matching (camelCase/snake_case decomposition), and category-aligned scoring. Only genuine database evidence IDs are used.'],
    ['9. Advance Genesis Model Interpretation', 'The Advance Genesis Model evaluates each requirement against its candidate evidence. The model is prohibited from referencing evidence IDs not in the candidate set. All returned evidence IDs are validated server-side; fabricated IDs are stripped and VERIFIED status is downgraded to UNVERIFIED.'],
    ['10. Status Assignment', 'Each requirement receives one of four statuses: VERIFIED, PARTIALLY_IMPLEMENTED, NOT_IMPLEMENTED, or UNVERIFIED. Results are persisted with the original run and are never overwritten by subsequent runs.'],
    ['11. Report Generation', 'This PDF report is generated from persisted database records associated with the selected verification run. Report generation does not trigger a new verification run or new model calls.'],
  ];

  steps.forEach(([title, desc]) => {
    ctx.ensureSpace(50);
    ctx.drawText(title, {
      x: MARGIN.left, y: ctx.y,
      size: FONT_SIZE.h3, font: ctx.fonts.bold, color: COLOR.navy,
    });
    ctx.advance(16);
    drawParagraph(ctx, desc, 10);
    ctx.advance(4);
  });

  drawDivider(ctx);
  drawParagraph(ctx,
    'Important: GENESIS does not execute uploaded source code. No package installations, runtime evaluations, or ' +
    'external network calls are made against the submitted repository. Static analysis identifies code structures ' +
    'but cannot verify runtime behavior, external service integration, or security properties under execution.'
  );

  ctx.drawFooter(footerLabel);
}

// ============================================================
// STATUS DEFINITIONS
// ============================================================
function buildStatusDefinitions(ctx, footerLabel) {
  ctx.addPage();
  drawSectionHeader(ctx, 'Verification Status Definitions', '4');

  const defs = [
    ['VERIFIED', 'verified',
      'Available static code evidence adequately supports the requirement and its testable acceptance criteria. ' +
      'This determination is based on structural code inspection only. It does not establish runtime correctness, ' +
      'functional completeness under all operational conditions, or freedom from defects.'],
    ['PARTIALLY_IMPLEMENTED', 'partial',
      'Credible code evidence supports some aspects of the requirement, but other important aspects remain ' +
      'incomplete, missing, or ambiguous. The implemented portions are identifiable from static analysis, ' +
      'but the full requirement is not satisfied based on available evidence.'],
    ['NOT_IMPLEMENTED', 'notImpl',
      'The available source inspection coverage is sufficiently complete and the required implementation is ' +
      'demonstrably absent. A missing keyword match alone is not sufficient to assign this status. This status ' +
      'is used conservatively — when GENESIS has adequate coverage confidence to make this determination.'],
    ['UNVERIFIED', 'unverified',
      'Available evidence is insufficient, ambiguous, incomplete, unsupported, or otherwise inadequate to make ' +
      'a reliable conclusion. This is the default status when meaningful uncertainty exists: insufficient evidence, ' +
      'ambiguous code, parser failures, unsupported language extensions, AI API unavailability, or inadequate ' +
      'inspection coverage.'],
  ];

  defs.forEach(([status, colorKey, description]) => {
    ctx.ensureSpace(80);
    ctx.advance(8);
    const cfg = statusConfig(status);

    // Status box
    const y = ctx.y;
    ctx.drawRect({ x: MARGIN.left, y: y - 24, width: CONTENT_W, height: 24, color: cfg.bg });
    ctx.drawRect({ x: MARGIN.left, y: y - 24, width: 4, height: 24, color: cfg.color });
    ctx.drawText(status, {
      x: MARGIN.left + 12, y: y - 15,
      size: FONT_SIZE.h3, font: ctx.fonts.bold, color: cfg.color,
    });
    ctx.advance(28);
    drawParagraph(ctx, description, 8);
    ctx.advance(6);
  });

  ctx.drawFooter(footerLabel);
}

// ============================================================
// TRACEABILITY MATRIX (per-requirement)
// ============================================================
function buildTraceabilityMatrix(ctx, reportData, footerLabel) {
  const { results } = reportData;

  ctx.addPage();
  drawSectionHeader(ctx, 'Requirement Traceability Matrix', '5');

  drawParagraph(ctx, `Total requirements evaluated: ${results.length}`);
  ctx.advance(8);

  const colW = [60, 180, 90, 90, 63];
  const headers = ['Code', 'Title', 'Category', 'Priority', 'Status'];
  drawTableHeader(ctx, headers, colW);

  results.forEach((r, i) => {
    const status = r.status;
    drawTableRow(
      ctx,
      [r.reqCode || r.req_code, r.title, r.category || '—', r.priority || '—', statusConfig(status).label],
      colW,
      status,
      i
    );
  });

  ctx.drawFooter(footerLabel);
}

// ============================================================
// DETAILED REQUIREMENT SECTIONS
// ============================================================
function buildDetailedRequirements(ctx, reportData, footerLabel) {
  const { results } = reportData;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    ctx.addPage();

    // Requirement heading bar
    const cfg = statusConfig(r.status);
    ctx.drawRect({ x: MARGIN.left, y: ctx.y - 32, width: CONTENT_W, height: 32, color: cfg.bg });
    ctx.drawRect({ x: MARGIN.left, y: ctx.y - 32, width: 4, height: 32, color: cfg.color });

    const reqLabel = `REQ ${i + 1} of ${results.length}  |  ${r.reqCode || r.req_code}`;
    ctx.drawText(reqLabel, {
      x: MARGIN.left + 12, y: ctx.y - 11,
      size: FONT_SIZE.small, font: ctx.fonts.bold, color: COLOR.slate,
    });
    ctx.drawText(r.title, {
      x: MARGIN.left + 12, y: ctx.y - 24,
      size: FONT_SIZE.h3, font: ctx.fonts.bold, color: cfg.color,
    });
    ctx.advance(42);

    // Status & metadata
    drawSubSectionHeader(ctx, 'Requirement Details');
    drawLabelValue(ctx, 'Requirement ID', r.id || r.requirement_id);
    drawLabelValue(ctx, 'Code', r.reqCode || r.req_code);
    drawLabelValue(ctx, 'Category', r.category || 'N/A');
    drawLabelValue(ctx, 'Priority', r.priority || 'N/A');
    drawLabelValue(ctx, 'Type', r.type || 'FUNCTIONAL_REQUIREMENT');
    if (r.is_overridden && r.override) {
      drawLabelValue(ctx, 'Original Status', r.status);
      drawLabelValue(ctx, 'Effective Status (Overridden)', r.effective_status || r.override.new_status);
      drawLabelValue(ctx, 'Override Reviewer', r.override.reviewer_name);
      drawLabelValue(ctx, 'Override Timestamp', formatDate(r.override.created_at));
      drawLabelValue(ctx, 'Override Justification', r.override.reason);
    } else {
      drawLabelValue(ctx, 'Verification Status', r.status);
    }
    const method = r.method || 'AI';
    drawLabelValue(ctx, 'Evaluation Method', method === 'RULES' ? 'Base Genesis Model' : 'Advance Genesis Model');
    if (r.fallback_reason) {
      drawLabelValue(ctx, 'Fallback Reason', r.fallback_reason);
    }
    if (r.carried_over_from_result_id) {
      drawLabelValue(ctx, 'Result Lineage', `Carried over from result ${r.carried_over_from_result_id}`);
    }
    if (r.confidence_score !== null && r.confidence_score !== undefined) {
      drawLabelValue(ctx, 'Confidence Score', `${(parseFloat(r.confidence_score || 0) * 100).toFixed(0)}%`);
    }
    drawDivider(ctx);

    // Description
    drawSubSectionHeader(ctx, 'Requirement Description');
    drawParagraph(ctx, r.description || 'No description recorded.');
    ctx.advance(4);

    // Acceptance criteria
    if (r.acceptance_criteria) {
      drawSubSectionHeader(ctx, 'Acceptance Criteria (from SRS)');
      drawParagraph(ctx, r.acceptance_criteria);
      ctx.advance(4);
    }

    // AI or Rules Explanation
    drawSubSectionHeader(ctx, method === 'RULES' ? 'Base Genesis Model Verification Rationale' : 'Advance Genesis Model Verification Rationale');
    drawParagraph(ctx, r.ai_explanation || 'No rationale recorded.');
    ctx.advance(4);

    // Criteria Assessment
    let criteriaItems = [];
    if (r.criteria_assessment) {
      try { criteriaItems = JSON.parse(r.criteria_assessment); } catch { criteriaItems = []; }
    }
    if (criteriaItems.length > 0) {
      drawSubSectionHeader(ctx, 'Acceptance Criteria Assessment');
      criteriaItems.forEach((ca, ci) => {
        ctx.ensureSpace(50);
        ctx.drawText(`Criterion ${ci + 1}: ${ca.criterion || 'N/A'}`, {
          x: MARGIN.left, y: ctx.y,
          size: FONT_SIZE.body, font: ctx.fonts.bold, color: COLOR.bodyText,
        });
        ctx.advance(14);
        drawLabelValue(ctx, 'Assessment', ca.assessment || 'N/A', 10);
        if (ca.explanation) drawParagraph(ctx, ca.explanation, 10);
        ctx.advance(4);
      });
    }

    // Supporting Evidence
    let evidenceItems = [];
    if (r.evidence_references) {
      try { evidenceItems = JSON.parse(r.evidence_references); } catch { evidenceItems = []; }
    }
    if (evidenceItems.length > 0) {
      drawSubSectionHeader(ctx, `Supporting Code Evidence (${evidenceItems.length} record${evidenceItems.length !== 1 ? 's' : ''})`);
      evidenceItems.forEach((ev, ei) => {
        ctx.ensureSpace(60);
        const lineRef = ev.endLine !== ev.startLine
          ? `L${ev.startLine}–L${ev.endLine}`
          : `L${ev.startLine}`;
        ctx.drawText(`Evidence ${ei + 1}: ${ev.identifier || ev.evidenceType || 'Unknown'}`, {
          x: MARGIN.left, y: ctx.y,
          size: FONT_SIZE.body, font: ctx.fonts.bold, color: COLOR.navy,
        });
        ctx.advance(14);
        drawLabelValue(ctx, 'Evidence ID', ev.id, 8);
        drawLabelValue(ctx, 'File Path', ev.filePath, 8);
        drawLabelValue(ctx, 'Lines', lineRef, 8);
        drawLabelValue(ctx, 'Type', ev.evidenceType || 'N/A', 8);
        drawLabelValue(ctx, 'Method', ev.analysisMethod || 'N/A', 8);
        if (ev.contextSummary) drawLabelValue(ctx, 'Summary', ev.contextSummary, 8);
        if (ev.codeSnippet) {
          drawCodeBlock(ctx, ev.codeSnippet, `Code Excerpt — ${ev.filePath} ${lineRef}`);
        }
        ctx.advance(4);
      });
    } else {
      drawSubSectionHeader(ctx, 'Supporting Code Evidence');
      drawParagraph(ctx, 'No supporting evidence records are linked to this result.', 0, COLOR.slate);
      ctx.advance(4);
    }

    // Contradicting Evidence
    let contradictingItems = [];
    if (r.contradicting_evidence) {
      try { contradictingItems = JSON.parse(r.contradicting_evidence); } catch { contradictingItems = []; }
    }
    if (contradictingItems.length > 0) {
      drawSubSectionHeader(ctx, 'Contradicting Evidence');
      contradictingItems.forEach((cid, ci) => {
        drawParagraph(ctx, `${ci + 1}. Evidence ID: ${cid}`, 8);
      });
      ctx.advance(4);
    }

    // Limitations
    let limitItems = [];
    if (r.limitations) {
      try { limitItems = JSON.parse(r.limitations); } catch { limitItems = []; }
    }
    if (limitItems.length > 0) {
      drawSubSectionHeader(ctx, 'Analysis Limitations');
      limitItems.forEach((lim, li) => {
        drawParagraph(ctx, `${li + 1}. ${lim}`, 8, COLOR.slate);
      });
    }

    ctx.drawFooter(footerLabel);
  }
}

// ============================================================
// LIMITATIONS SECTION
// ============================================================
function buildLimitations(ctx, reportData, footerLabel) {
  const { results, run, submission } = reportData;

  ctx.addPage();
  drawSectionHeader(ctx, 'Limitations and Unverified Areas', '6');

  const systemLimits = [
    'GENESIS performs static source-code inspection only. Uploaded source code is never executed.',
    'AST-based parsing is currently supported for JavaScript/JSX/MJS via Babel. Python, Java, SQL, and HTML use heuristic pattern matching.',
    'Highly dynamic code constructs (eval, reflection, metaprogramming) cannot be resolved statically.',
    'Scanned PDF documents without selectable text layers cannot have text extracted.',
    'Code presence does not prove that functionality works correctly, is free of defects, or satisfies all operational conditions.',
    'Absence of a code match alone does not prove non-implementation. Code may be distributed across multiple files, generated at build time, or use patterns not covered by current analyzers.',
    'Advance Genesis Model interpretation is grounded in retrieved evidence records. Model unavailability produces UNVERIFIED results for affected requirements.',
    'Base Genesis Model Policy: When Advance Genesis Model is overloaded, unavailable, or disabled, GENESIS evaluates requirements via Base Genesis Model. Base Genesis Model NEVER returns NOT_IMPLEMENTED, caps confidence at 0.65, and requires >=2 independent evidence items and >=75% criteria coverage for VERIFIED. Base evaluations should be re-run with Advance Genesis Model when available.',
    'Human Override Policy: Verification outcomes may be manually reviewed and adjusted by auditors with mandatory rationale. Reviewer identities are self-declared (no authentication) and all overrides are permanently preserved in the immutable audit log.',
  ];

  drawSubSectionHeader(ctx, 'System-Level Limitations');
  systemLimits.forEach((lim, i) => {
    drawParagraph(ctx, `${i + 1}. ${lim}`, 8);
    ctx.advance(2);
  });

  drawDivider(ctx);

  // Run-specific unverified requirements
  const unverifiedReqs = results.filter(r => r.status === 'UNVERIFIED' || r.status === 'NOT_IMPLEMENTED');
  if (unverifiedReqs.length > 0) {
    drawSubSectionHeader(ctx, 'Requirements Requiring Additional Attention');
    unverifiedReqs.forEach((r, i) => {
      ctx.ensureSpace(28);
      const cfg = statusConfig(r.status);
      ctx.drawText(`${i + 1}. [${cfg.label}] ${r.reqCode || r.req_code}: ${r.title}`, {
        x: MARGIN.left + 8, y: ctx.y,
        size: FONT_SIZE.body, font: ctx.fonts.bold, color: cfg.color,
      });
      ctx.advance(14);
    });
  }

  ctx.drawFooter(footerLabel);
}

// ============================================================
// AUDIT INFORMATION
// ============================================================
function buildAuditInfo(ctx, reportData, footerLabel) {
  const { project, run, submission, srsDoc, reportId, reportSha256, generatedAt } = reportData;
  ctx.addPage();
  drawSectionHeader(ctx, 'Audit and Reproducibility Information', '7');

  drawSubSectionHeader(ctx, 'Report Identity');
  drawLabelValue(ctx, 'Report ID', reportId);
  drawLabelValue(ctx, 'Report Version', '1.0.0');
  drawLabelValue(ctx, 'Generated At', formatDate(generatedAt));
  if (reportSha256) drawLabelValue(ctx, 'Report SHA-256', reportSha256);
  drawDivider(ctx);

  drawSubSectionHeader(ctx, 'Verification Run');
  drawLabelValue(ctx, 'Run ID', run.id);
  drawLabelValue(ctx, 'Project ID', project.id);
  drawLabelValue(ctx, 'Run Status', run.status);
  drawLabelValue(ctx, 'Started At', formatDate(run.started_at));
  drawLabelValue(ctx, 'Completed At', formatDate(run.completed_at) || 'N/A');
  drawLabelValue(ctx, 'Advance Genesis Model', run.model_name || 'Not recorded');
  drawLabelValue(ctx, 'Analysis Version', '1.0.0');
  drawDivider(ctx);

  drawSubSectionHeader(ctx, 'SRS Document');
  if (srsDoc) {
    drawLabelValue(ctx, 'Document ID', srsDoc.id);
    drawLabelValue(ctx, 'Document Name', srsDoc.original_name || srsDoc.filename);
    drawLabelValue(ctx, 'Document Status', srsDoc.status);
  } else {
    drawParagraph(ctx, 'SRS document information is not available.');
  }
  drawDivider(ctx);

  drawSubSectionHeader(ctx, 'Source Submission');
  if (submission) {
    drawLabelValue(ctx, 'Submission ID', submission.id);
    drawLabelValue(ctx, 'Filename', submission.filename);
    drawLabelValue(ctx, 'Archive SHA-256', submission.archive_hash || 'Not recorded');
    drawLabelValue(ctx, 'Submission Version', String(submission.version || 1));
  } else {
    drawParagraph(ctx, 'Source submission information is not available.');
  }

  ctx.drawFooter(footerLabel);
}

// ============================================================
// DISCLAIMER
// ============================================================
function buildDisclaimer(ctx, footerLabel) {
  ctx.addPage();
  drawSectionHeader(ctx, 'Academic Integrity and Final Disclaimer', '8');

  const disclaimers = [
    'GENESIS performs static source-code inspection combined with evidence-grounded AI interpretation. It does not execute uploaded source code, install dependencies from submitted repositories, or make runtime assertions.',
    '"VERIFIED" means that the available static code evidence adequately supports the stated requirement. It does not guarantee that the software executes correctly, is free of defects, satisfies all operational conditions, or passes runtime testing.',
    '"NOT_IMPLEMENTED" is determined conservatively based on sufficiently complete source inspection. A missing keyword match alone is not sufficient. GENESIS uses UNVERIFIED when inspection coverage is incomplete.',
    'AI interpretation is grounded in a bounded set of genuine candidate evidence records retrieved through deterministic matching. Fabricated evidence IDs are stripped server-side before persistence.',
    'All evidence records — file paths, line numbers, identifiers, and code excerpts — originate from static analysis of the submitted archive and are not fabricated or inferred by the AI model.',
    'This report reflects the selected verification run and the information available to GENESIS at the time of that run. It does not update automatically when subsequent runs are executed.',
    'Human review by qualified engineers is recommended before using this report for important engineering decisions, compliance assessments, or academic submissions.',
    'GENESIS is an academic demonstration framework and should not be treated as a certified software verification or auditing system.',
  ];

  disclaimers.forEach((d, i) => {
    ctx.ensureSpace(50);
    ctx.advance(4);
    ctx.drawText(`${i + 1}.`, {
      x: MARGIN.left, y: ctx.y,
      size: FONT_SIZE.body, font: ctx.fonts.bold, color: COLOR.navy,
    });
    drawParagraph(ctx, d, 16);
    ctx.advance(4);
  });

  drawDivider(ctx);

  // Final statement
  ctx.advance(10);
  ctx.ensureSpace(60);
  ctx.drawRect({
    x: MARGIN.left, y: ctx.y - 50, width: CONTENT_W, height: 54,
    color: COLOR.navy, borderWidth: 0,
  });
  ctx.drawText('End of GENESIS Verification Report', {
    x: MARGIN.left + 20, y: ctx.y - 20,
    size: FONT_SIZE.h3, font: ctx.fonts.bold, color: COLOR.white,
  });
  ctx.drawText('This document was generated by GENESIS — An Evidence-Grounded AI Framework', {
    x: MARGIN.left + 20, y: ctx.y - 36,
    size: FONT_SIZE.small, font: ctx.fonts.regular, color: rgb(0.75, 0.82, 0.93),
  });
  ctx.advance(60);

  ctx.drawFooter(footerLabel);
}

// ============================================================
// Table helpers
// ============================================================
function drawTableHeader(ctx, headers, colWidths) {
  ctx.ensureSpace(28);
  const y = ctx.y;
  let x = MARGIN.left;

  ctx.drawRect({ x: MARGIN.left, y: y - 20, width: CONTENT_W, height: 20, color: COLOR.navyMid });

  headers.forEach((h, i) => {
    ctx.drawText(h, {
      x: x + 4, y: y - 13,
      size: FONT_SIZE.label, font: ctx.fonts.bold, color: COLOR.white,
    });
    x += colWidths[i];
  });
  ctx.advance(22);
}

function drawTableRow(ctx, cells, colWidths, status, rowIndex) {
  const cfg = status ? statusConfig(status) : null;
  const rowH = 20;
  ctx.ensureSpace(rowH + 4);

  const y = ctx.y;
  const bgColor = rowIndex % 2 === 0 ? COLOR.white : COLOR.slateBg;
  ctx.drawRect({ x: MARGIN.left, y: y - rowH + 2, width: CONTENT_W, height: rowH, color: bgColor });

  let x = MARGIN.left;
  cells.forEach((cell, i) => {
    const isLastCell = i === cells.length - 1;
    const cellColor = (isLastCell && cfg) ? cfg.color : COLOR.bodyText;
    const cellFont = (isLastCell && cfg) ? ctx.fonts.bold : ctx.fonts.regular;
    // Truncate long text to fit column
    let text = sanitizeForPdf(cell ?? '');
    const maxW = colWidths[i] - 10;
    while (text.length > 3 && ctx.fonts.regular.widthOfTextAtSize(text, FONT_SIZE.body) > maxW) {
      text = text.slice(0, -1);
    }
    if (text !== sanitizeForPdf(cell ?? '') && text.length > 3) text = text.slice(0, -3) + '...';
    ctx.drawText(text, {
      x: x + 4, y: y - 12,
      size: FONT_SIZE.body, font: cellFont, color: cellColor,
    });
    x += colWidths[i];
  });

  ctx.advance(rowH + 2);
}

// ============================================================
// Helpers
// ============================================================
function formatDate(isoStr) {
  if (!isoStr) return 'N/A';
  try {
    const d = new Date(isoStr);
    return d.toUTCString();
  } catch { return String(isoStr); }
}

function formatBytes(bytes) {
  if (!bytes) return 'N/A';
  const b = Number(bytes);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

/**
 * Generates an audit-grade PDF report for a completed verification run.
 *
 * @param {Object} reportData
 * @param {Object} reportData.project          - Project DB row
 * @param {Object} reportData.run              - Verification run DB row
 * @param {Object} reportData.submission       - Code submission DB row (nullable)
 * @param {Object} reportData.srsDoc           - SRS document DB row (nullable)
 * @param {Array}  reportData.results          - Array of enriched verification result objects
 * @param {string} reportData.reportId         - Generated report ID
 * @param {string} reportData.generatedAt      - ISO timestamp of generation
 * @param {string} [reportData.reportSha256]   - SHA-256 of the report (optional, computed after generation)
 * @returns {Promise<Buffer>}                  - Binary PDF buffer
 */
export async function generateVerificationPDF(reportData) {
  const doc = await PDFDocument.create();

  // Document metadata
  doc.setTitle(`GENESIS Verification Report — ${reportData.project.name}`);
  doc.setAuthor('GENESIS Verification Framework');
  doc.setSubject('Software Requirement Traceability and Implementation Verification Report');
  doc.setKeywords(['GENESIS', 'verification', 'traceability', 'requirements', 'static analysis']);
  doc.setCreationDate(new Date());

  // Load fonts
  const [helvetica, helveticaBold, courier] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.Courier),
  ]);

  const fonts = {
    regular: helvetica,
    bold:    helveticaBold,
    mono:    courier,
  };

  const ctx = new DocumentContext(doc, fonts);

  const footerLabel = `GENESIS Verification Report — ${reportData.project.name} — Run: ${reportData.run.id}`;

  // Build all sections
  buildCoverPage(ctx, reportData);
  buildExecutiveSummary(ctx, reportData, footerLabel);
  buildProjectInfo(ctx, reportData, footerLabel);
  buildMethodology(ctx, footerLabel);
  buildStatusDefinitions(ctx, footerLabel);
  buildTraceabilityMatrix(ctx, reportData, footerLabel);
  buildDetailedRequirements(ctx, reportData, footerLabel);
  buildLimitations(ctx, reportData, footerLabel);
  buildAuditInfo(ctx, reportData, footerLabel);
  buildDisclaimer(ctx, footerLabel);

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

