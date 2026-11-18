import { getExcerpt } from './javascriptAnalyzer.js';

/**
 * Analyzes Java source code using pattern and heuristic matching.
 * Labelled as analysisMethod = 'HEURISTIC'.
 *
 * @param {string} content - Full source code text
 * @param {string} filePath - Normalized relative path
 * @returns {Array<Object>} List of evidence objects
 */
export function analyzeJava(content, filePath) {
  if (!content || typeof content !== 'string') return [];

  const lines = content.split('\n');
  const evidence = [];

  function getLineNumber(index) {
    return content.substring(0, index).split('\n').length;
  }

  // 1. Class / Interface / Enum declarations
  const classRegex = /(?:public|protected|private|abstract|static|\s)*\b(class|interface|enum)\s+([a-zA-Z0-9_]+)/g;
  let match;
  while ((match = classRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    const kind = match[1];
    const name = match[2];

    evidence.push({
      filePath,
      language: 'java',
      evidenceType: 'CLASS',
      identifier: `${kind} ${name}`,
      startLine,
      endLine: Math.min(startLine + 4, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 4),
      contextSummary: `Heuristic: Java ${kind} declaration '${name}'`,
      analysisMethod: 'HEURISTIC',
      confidence: 'HIGH',
    });
  }

  // 2. Spring Web / JAX-RS API Endpoints
  const endpointRegex = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*(?:\(\s*(?:value\s*=\s*)?["']([^"']+)["'])?/g;
  while ((match = endpointRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    const annotation = match[1];
    const route = match[2] || '/';
    const httpMethod = annotation.replace('Mapping', '').toUpperCase() || 'HTTP';

    evidence.push({
      filePath,
      language: 'java',
      evidenceType: 'API_ENDPOINT',
      identifier: `${httpMethod} ${route}`,
      startLine,
      endLine: Math.min(startLine + 3, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 3),
      contextSummary: `Heuristic: Spring REST endpoint @${annotation} "${route}"`,
      analysisMethod: 'HEURISTIC',
      confidence: 'HIGH',
    });
  }

  // 3. Methods
  const methodRegex = /(?:public|protected|private|static|final|\s)+[\w<>\[\], ?]+\s+([a-zA-Z0-9_]+)\s*\((.*?)\)\s*(?:throws\s+[\w,\s]+)?\s*\{/g;
  while ((match = methodRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    const methodName = match[1];

    // Filter out keywords that can look like methods
    if (['if', 'for', 'while', 'switch', 'catch', 'synchronized'].includes(methodName)) {
      continue;
    }

    evidence.push({
      filePath,
      language: 'java',
      evidenceType: 'METHOD',
      identifier: `${methodName}()`,
      startLine,
      endLine: Math.min(startLine + 4, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 4),
      contextSummary: `Heuristic: Java method '${methodName}'`,
      analysisMethod: 'HEURISTIC',
      confidence: 'HIGH',
    });
  }

  // 4. Test annotations: @Test, @ParameterizedTest
  const testRegex = /@(Test|ParameterizedTest|BeforeEach|AfterEach|BeforeAll|AfterAll)/g;
  while ((match = testRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    evidence.push({
      filePath,
      language: 'java',
      evidenceType: 'TEST_REFERENCE',
      identifier: `@${match[1]}`,
      startLine,
      endLine: Math.min(startLine + 3, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 3),
      contextSummary: `Heuristic: JUnit/TestNG test indicator @${match[1]}`,
      analysisMethod: 'HEURISTIC',
      confidence: 'HIGH',
    });
  }

  // 5. Database operations / JPA / Hibernate / JDBC
  const dbRegex = /@(Entity|Table|Repository)|(?:JpaRepository|CrudRepository)<|(?:entityManager|jdbcTemplate)\./g;
  while ((match = dbRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    evidence.push({
      filePath,
      language: 'java',
      evidenceType: 'DATABASE_OPERATION',
      identifier: match[0],
      startLine,
      endLine: Math.min(startLine + 2, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 2),
      contextSummary: `Heuristic: Java JPA/Database operation indicator`,
      analysisMethod: 'HEURISTIC',
      confidence: 'HIGH',
    });
  }

  // 6. Authentication indicators: Spring Security
  const authRegex = /@(PreAuthorize|Secured|RolesAllowed)|(?:BCryptPasswordEncoder|SecurityFilterChain|UserDetailsService)/g;
  while ((match = authRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    evidence.push({
      filePath,
      language: 'java',
      evidenceType: 'AUTHENTICATION_INDICATOR',
      identifier: match[0],
      startLine,
      endLine: Math.min(startLine + 2, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 2),
      contextSummary: `Heuristic: Spring Security / Authentication indicator`,
      analysisMethod: 'HEURISTIC',
      confidence: 'HIGH',
    });
  }

  // 7. Validation indicators: Bean validation
  const valRegex = /@(NotNull|NotEmpty|NotBlank|Size|Valid|Pattern|Min|Max)/g;
  while ((match = valRegex.exec(content)) !== null) {
    const startLine = getLineNumber(match.index);
    evidence.push({
      filePath,
      language: 'java',
      evidenceType: 'VALIDATION_INDICATOR',
      identifier: `@${match[1]}`,
      startLine,
      endLine: Math.min(startLine + 2, lines.length),
      codeSnippet: getExcerpt(lines, startLine, startLine + 2),
      contextSummary: `Heuristic: Jakarta/Java Bean Validation annotation @${match[1]}`,
      analysisMethod: 'HEURISTIC',
      confidence: 'HIGH',
    });
  }

  return evidence;
}

