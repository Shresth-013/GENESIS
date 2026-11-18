import { getExcerpt } from './javascriptAnalyzer.js';

/**
 * Analyzes SQL source files using regex pattern matching.
 * Identifies database table definitions, queries, migrations, and schema constraints.
 *
 * @param {string} content - Full SQL text
 * @param {string} filePath - Normalized relative path
 * @returns {Array<Object>} List of evidence objects
 */
export function analyzeSql(content, filePath) {
  if (!content || typeof content !== 'string') return [];

  const lines = content.split('\n');
  const evidence = [];

  function getLineNumber(index) {
    return content.substring(0, index).split('\n').length;
  }

  // 1. Table Creations: CREATE TABLE [IF NOT EXISTS] table_name
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_`"[\]]+)/gi;
  let match;
  while ((match = createTableRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    const tableName = match[1].replace(/[`"[\]]/g, '');

    evidence.push({
      filePath,
      language: 'sql',
      evidenceType: 'DATABASE_OPERATION',
      identifier: `CREATE TABLE ${tableName}`,
      startLine,
      endLine: Math.min(startLine + 5, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 5),
      contextSummary: `SQL Schema: Table creation '${tableName}'`,
      analysisMethod: 'PATTERN',
      confidence: 'HIGH',
    });
  }

  // 2. Table Modifications: ALTER TABLE table_name
  const alterTableRegex = /ALTER\s+TABLE\s+([a-zA-Z0-9_`"[\]]+)/gi;
  while ((match = alterTableRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    const tableName = match[1].replace(/[`"[\]]/g, '');

    evidence.push({
      filePath,
      language: 'sql',
      evidenceType: 'DATABASE_OPERATION',
      identifier: `ALTER TABLE ${tableName}`,
      startLine,
      endLine: Math.min(startLine + 2, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 2),
      contextSummary: `SQL Schema: Alter table '${tableName}'`,
      analysisMethod: 'PATTERN',
      confidence: 'HIGH',
    });
  }

  // 3. Index Creations: CREATE [UNIQUE] INDEX ... ON table_name
  const createIndexRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_`"[\]]+)\s+ON\s+([a-zA-Z0-9_`"[\]]+)/gi;
  while ((match = createIndexRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    const indexName = match[1].replace(/[`"[\]]/g, '');
    const tableName = match[2].replace(/[`"[\]]/g, '');

    evidence.push({
      filePath,
      language: 'sql',
      evidenceType: 'DATABASE_OPERATION',
      identifier: `INDEX ${indexName} ON ${tableName}`,
      startLine,
      endLine: Math.min(startLine + 2, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 2),
      contextSummary: `SQL Index creation '${indexName}' on table '${tableName}'`,
      analysisMethod: 'PATTERN',
      confidence: 'HIGH',
    });
  }

  // 4. Data Mutations / Operations (INSERT, UPDATE, DELETE)
  const dmlRegex = /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-zA-Z0-9_`"[\]]+)/gi;
  while ((match = dmlRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    const op = match[1].toUpperCase();
    const table = match[2].replace(/[`"[\]]/g, '');

    evidence.push({
      filePath,
      language: 'sql',
      evidenceType: 'DATABASE_OPERATION',
      identifier: `${op} ${table}`,
      startLine,
      endLine: Math.min(startLine + 2, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 2),
      contextSummary: `SQL DML Operation: ${op} on '${table}'`,
      analysisMethod: 'PATTERN',
      confidence: 'HIGH',
    });
  }

  return evidence;
}

