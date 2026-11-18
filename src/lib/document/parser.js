import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

// Configure pdfjs worker to absolute file URL so it resolves correctly in Next.js server runtime
try {
  const candidateWorker = path.resolve(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.mjs');
  if (fs.existsSync(candidateWorker)) {
    PDFParse.setWorker(pathToFileURL(candidateWorker).href);
  }
} catch (e) {
  // Gracefully fallback to default
}

export const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/x-pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/octet-stream', // Fallback for browsers misreporting docx
];

export const DEFAULT_MAX_FILE_SIZE = (parseInt(process.env.MAX_UPLOAD_SIZE_MB, 10) || 15) * 1024 * 1024; // 15 MB

/**
 * Validates document metadata before processing.
 * @param {string} originalName
 * @param {string} mimeType
 * @param {number} sizeBytes
 * @param {number} [maxSize]
 */
export function validateDocumentUpload(originalName, mimeType, sizeBytes, maxSize = DEFAULT_MAX_FILE_SIZE) {
  if (!originalName || typeof originalName !== 'string') {
    throw new Error('Filename is missing or invalid.');
  }

  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file extension "${ext}". Only PDF and DOCX files are supported.`);
  }

  if (sizeBytes <= 0) {
    throw new Error('Uploaded document is empty (0 bytes).');
  }

  if (sizeBytes > maxSize) {
    const maxMb = Math.round(maxSize / (1024 * 1024));
    throw new Error(`Document exceeds maximum allowed size of ${maxMb} MB.`);
  }

  // Validate MIME type
  if (mimeType && !ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
    throw new Error(`Unsupported MIME type "${mimeType}". Only PDF and DOCX documents are accepted.`);
  }

  return { isValid: true, ext };
}

/**
 * Parses and extracts text content with page or paragraph references from a document buffer.
 * @param {Buffer} buffer
 * @param {string} filename
 * @returns {Promise<{
 *   type: 'pdf'|'docx',
 *   fullText: string,
 *   pageCount: number,
 *   paragraphCount: number,
 *   wordCount: number,
 *   sections: Array<{ reference: string, text: string }>
 * }>}
 */
export async function parseDocument(buffer, filename) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Invalid or empty document buffer provided.');
  }

  const ext = path.extname(filename).toLowerCase();

  if (ext === '.pdf') {
    return await parsePdf(buffer);
  } else if (ext === '.docx') {
    return await parseDocx(buffer);
  } else {
    throw new Error(`Unsupported file extension "${ext}". Must be .pdf or .docx.`);
  }
}

/**
 * Extracts page-by-page text from a PDF buffer using pdf-parse.
 */
async function parsePdf(buffer) {
  let parser = null;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();

    const pages = (result.pages || []).map((p) => ({
      reference: `Page ${p.num}`,
      pageNumber: p.num,
      text: (p.text || '').trim(),
    }));

    const fullText = (result.text || '').trim();

    if (fullText.length === 0) {
      throw new Error(
        'Scanned document detected with no extractable text layer. Optical Character Recognition (OCR) is not currently supported; please provide a PDF with selectable text or a DOCX document.'
      );
    }

    if (fullText.length < 50) {
      throw new Error(
        'Document contains insufficient extractable text (fewer than 50 characters). Please provide a complete Software Requirements Specification (SRS) document.'
      );
    }

    const words = fullText.split(/\s+/).filter(Boolean).length;

    return {
      type: 'pdf',
      fullText,
      pageCount: result.total || pages.length || 1,
      paragraphCount: pages.length,
      wordCount: words,
      sections: pages,
    };
  } catch (error) {
    if (error.message && error.message.includes('Scanned document')) {
      throw error;
    }
    if (error.message && error.message.includes('insufficient extractable text')) {
      throw error;
    }
    throw new Error(`PDF extraction failed: ${error.message || 'Malformed or corrupted PDF structure.'}`);
  } finally {
    if (parser && typeof parser.destroy === 'function') {
      try {
        await parser.destroy();
      } catch {}
    }
  }
}

/**
 * Extracts structured paragraph text from a DOCX buffer using Mammoth.
 */
async function parseDocx(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const rawText = (result.value || '').trim();

    if (rawText.length === 0) {
      throw new Error('DOCX document contains no text content.');
    }

    if (rawText.length < 50) {
      throw new Error(
        'Document contains insufficient extractable text (fewer than 50 characters). Please provide a complete Software Requirements Specification (SRS) document.'
      );
    }

    const paragraphs = rawText
      .split(/\r?\n\s*\r?\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const sections = paragraphs.map((para, idx) => ({
      reference: `Paragraph ${idx + 1}`,
      paragraphNumber: idx + 1,
      text: para,
    }));

    const words = rawText.split(/\s+/).filter(Boolean).length;
    // Estimate page count (~350 words per standard page)
    const estimatedPages = Math.max(1, Math.ceil(words / 350));

    return {
      type: 'docx',
      fullText: rawText,
      pageCount: estimatedPages,
      paragraphCount: paragraphs.length,
      wordCount: words,
      sections,
    };
  } catch (error) {
    if (error.message && error.message.includes('insufficient extractable text')) {
      throw error;
    }
    if (error.message && error.message.includes('contains no text content')) {
      throw error;
    }
    throw new Error(`DOCX extraction failed: ${error.message || 'Malformed or corrupted DOCX archive.'}`);
  }
}
