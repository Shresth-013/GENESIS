/**
 * GENESIS Deterministic Rule Catalog
 * Data-driven pattern definitions for static code verification fallback.
 * Uses ONLY evidence_type values emitted by GENESIS analyzers:
 * - API_ENDPOINT
 * - AUTHENTICATION_INDICATOR
 * - VALIDATION_INDICATOR
 * - DATABASE_OPERATION
 * - TEST_REFERENCE
 * - FUNCTION
 * - METHOD
 * - CLASS
 * - OTHER
 */

// Universal code stub markers indicating incomplete implementations
export const STUB_PATTERNS = [
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /\bXXX\b/i,
  /throw\s+new\s+Error\s*\(\s*['"`](?:not\s+implemented|to\s+be\s+implemented|stub)['"`]\s*\)/i,
  /raise\s+NotImplementedError/i,
  /return\s+(?:null|nil|None)\s*;\s*$/m,
  /^\s*pass\s*$/m,
  /{\s*\/\*\s*TODO\s*\*\/|\/\/\s*TODO\s*}/i,
  /function\s*\w*\s*\([^)]*\)\s*\{\s*\}/,
];

export const RULE_CATALOG = [
  {
    id: 'RULE_AUTH_LOGIN',
    name: 'Authentication & User Login',
    triggerRegexes: [
      /\b(?:auth|authenticate|authentication|login|sign[- ]?in|credentials|oauth|sso)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['AUTHENTICATION_INDICATOR', 'API_ENDPOINT', 'FUNCTION', 'METHOD'],
      identifierPatterns: [
        /\b(?:auth|login|signin|authenticate|verifycredentials|passport|oauth)\b/i,
      ],
      snippetPatterns: [
        /\b(?:bcrypt|argon2|passport|jwt|session|login|authenticate)\b/i,
      ],
    },
  },
  {
    id: 'RULE_PASSWORD_HASHING',
    name: 'Password Hashing & Encryption',
    triggerRegexes: [
      /\b(?:password|hash|hashing|salted|bcrypt|argon2|pbkdf2)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['AUTHENTICATION_INDICATOR', 'FUNCTION', 'METHOD'],
      identifierPatterns: [
        /\b(?:hash|compare|hashpassword|verifypassword|bcrypt|argon2)\b/i,
      ],
      snippetPatterns: [
        /\b(?:bcrypt\.hash|argon2\.hash|pbkdf2|genSalt|hashPassword)\b/i,
      ],
    },
  },
  {
    id: 'RULE_SESSION_JWT',
    name: 'Session Management & Token Generation',
    triggerRegexes: [
      /\b(?:jwt|token|bearer|session|cookie|refresh[- ]?token|access[- ]?token)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['AUTHENTICATION_INDICATOR', 'API_ENDPOINT', 'FUNCTION', 'METHOD'],
      identifierPatterns: [
        /\b(?:jwt|token|sign|verify|session|refreshtoken|accesstoken)\b/i,
      ],
      snippetPatterns: [
        /\b(?:jwt\.sign|jwt\.verify|session\.id|authorization:\s*['"]bearer)\b/i,
      ],
    },
  },
  {
    id: 'RULE_AUTHORIZATION_RBAC',
    name: 'Authorization & Role-Based Access Control',
    triggerRegexes: [
      /\b(?:role|permission|rbac|authorize|authorization|admin|forbidden|allowedroles)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['AUTHENTICATION_INDICATOR', 'API_ENDPOINT', 'FUNCTION', 'METHOD'],
      identifierPatterns: [
        /\b(?:authorize|checkpermission|hasrole|requireadmin|guard|rbac)\b/i,
      ],
      snippetPatterns: [
        /\b(?:roles?\.includes|permission|403|unauthorized|forbidden|isAdmin)\b/i,
      ],
    },
  },
  {
    id: 'RULE_INPUT_VALIDATION',
    name: 'Input Validation & Schema Verification',
    triggerRegexes: [
      /\b(?:validat(?:e|ion)|schema|sanitize|sanitization|input\s+check|zod|joi)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['VALIDATION_INDICATOR', 'FUNCTION', 'METHOD', 'CLASS'],
      identifierPatterns: [
        /\b(?:validate|schema|zod|joi|yup|validator|isemail|check)\b/i,
      ],
      snippetPatterns: [
        /\b(?:z\.object|joi\.object|schema\.parse|validate\(|validator)\b/i,
      ],
    },
  },
  {
    id: 'RULE_CRUD_API_ENDPOINTS',
    name: 'CRUD API & Route Handlers',
    triggerRegexes: [
      /\b(?:api|endpoint|route|crud|rest|http|request|handler|get|post|put|delete|patch)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['API_ENDPOINT', 'FUNCTION', 'METHOD'],
      identifierPatterns: [
        /\b(?:GET|POST|PUT|DELETE|PATCH)\s+[\w/.-]+/i,
        /\b(?:route|router|handler|endpoint|controller)\b/i,
      ],
      snippetPatterns: [
        /\b(?:app\.(?:get|post|put|delete)|NextResponse\.json|res\.status)\b/i,
      ],
    },
  },
  {
    id: 'RULE_DATABASE_PERSISTENCE',
    name: 'Database Persistence & ORM Operations',
    triggerRegexes: [
      /\b(?:database|db|sqlite|sql|postgres|mysql|query|table|insert|update|save|model|persist)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['DATABASE_OPERATION', 'CLASS', 'FUNCTION', 'METHOD'],
      identifierPatterns: [
        /\b(?:db|query|execute|save|find|insert|update|repository|model)\b/i,
      ],
      snippetPatterns: [
        /\b(?:SELECT|INSERT|UPDATE|DELETE|prisma|sequelize|knex|db\.query)\b/i,
      ],
    },
  },
  {
    id: 'RULE_FILE_UPLOAD',
    name: 'File Upload & Storage Handling',
    triggerRegexes: [
      /\b(?:upload|file|document|storage|attachment|multipart|s3|disk)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['API_ENDPOINT', 'FUNCTION', 'METHOD', 'CLASS'],
      identifierPatterns: [
        /\b(?:upload|file|storage|savefile|s3|diskstorage|writefile)\b/i,
      ],
      snippetPatterns: [
        /\b(?:multipart|formData|fs\.writeFile|storageProvider|upload)\b/i,
      ],
    },
  },
  {
    id: 'RULE_ERROR_HANDLING',
    name: 'Error Handling & Exception Management',
    triggerRegexes: [
      /\b(?:error|exception|fail(?:ure|safe)?|try[- ]?catch|status\s*500|handleerror)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['FUNCTION', 'METHOD', 'API_ENDPOINT'],
      identifierPatterns: [
        /\b(?:onerror|errorhandler|catcherror|handlerexception|customerror)\b/i,
      ],
      snippetPatterns: [
        /\b(?:try\s*\{|catch\s*\(|throw\s+new\s+Error|res\.status\(500\))\b/i,
      ],
    },
  },
  {
    id: 'RULE_LOGGING_AUDIT',
    name: 'Logging, Telemetry & Audit Trails',
    triggerRegexes: [
      /\b(?:log(?:ging)?|audit|telemetry|trace|logger|record\s+activity)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['FUNCTION', 'METHOD', 'CLASS', 'API_ENDPOINT'],
      identifierPatterns: [
        /\b(?:logger|audit|logevent|tracer|recordaudit)\b/i,
      ],
      snippetPatterns: [
        /\b(?:console\.(?:log|warn|error)|logger\.(?:info|error)|auditLog)\b/i,
      ],
    },
  },
  {
    id: 'RULE_ENCRYPTION_HTTPS',
    name: 'Encryption & Data Protection',
    triggerRegexes: [
      /\b(?:encrypt(?:ion)?|decrypt(?:ion)?|aes|cipher|crypto|tls|https)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['AUTHENTICATION_INDICATOR', 'FUNCTION', 'METHOD'],
      identifierPatterns: [
        /\b(?:crypto|cipher|encrypt|decrypt|createcipher|secret)\b/i,
      ],
      snippetPatterns: [
        /\b(?:crypto\.createCipher|createHash|aes-256|https)\b/i,
      ],
    },
  },
  {
    id: 'RULE_SEARCH_PAGINATION',
    name: 'Search, Filtering & Pagination',
    triggerRegexes: [
      /\b(?:search|filter|page|pagination|offset|limit|query\s+filter)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['API_ENDPOINT', 'DATABASE_OPERATION', 'FUNCTION', 'METHOD'],
      identifierPatterns: [
        /\b(?:search|filter|paginate|pagination|limit|offset)\b/i,
      ],
      snippetPatterns: [
        /\b(?:LIMIT\s+\d+|OFFSET\s+\d+|page\s*=|filter\(|includes\()\b/i,
      ],
    },
  },
  {
    id: 'RULE_NOTIFICATIONS_EMAIL',
    name: 'Notifications & Email Delivery',
    triggerRegexes: [
      /\b(?:notif(?:y|ication)|email|mail|alert|smtp|webhook|message)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['API_ENDPOINT', 'FUNCTION', 'METHOD'],
      identifierPatterns: [
        /\b(?:sendemail|notify|mailer|smtp|sendnotification|mailservice)\b/i,
      ],
      snippetPatterns: [
        /\b(?:sendMail|nodemailer|email|smtp|notification)\b/i,
      ],
    },
  },
  {
    id: 'RULE_EXPORT_REPORT',
    name: 'Report Generation & Document Export',
    triggerRegexes: [
      /\b(?:export|report|pdf|csv|excel|download|generate\s+report)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['API_ENDPOINT', 'FUNCTION', 'METHOD', 'CLASS'],
      identifierPatterns: [
        /\b(?:report|pdf|export|csv|generator|download)\b/i,
      ],
      snippetPatterns: [
        /\b(?:pdf-lib|PDFDocument|csv|export|Content-Disposition|attachment)\b/i,
      ],
    },
  },
  {
    id: 'RULE_RATE_LIMITING',
    name: 'Rate Limiting & Throttling',
    triggerRegexes: [
      /\b(?:rate[- ]?limit(?:ing)?|throttle|throttling|bucket|rpm|quota)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['FUNCTION', 'METHOD', 'API_ENDPOINT'],
      identifierPatterns: [
        /\b(?:ratelimit|throttle|limiter|tokenbucket|checkquota)\b/i,
      ],
      snippetPatterns: [
        /\b(?:rateLimit|429|Retry-After|tokens|capacity)\b/i,
      ],
    },
  },
  {
    id: 'RULE_CACHING',
    name: 'Caching & Temporary Storage',
    triggerRegexes: [
      /\b(?:cache|caching|redis|memcached|lru|ttl|in-memory)\b/i,
    ],
    expectedSignals: {
      evidenceTypes: ['FUNCTION', 'METHOD', 'CLASS', 'DATABASE_OPERATION'],
      identifierPatterns: [
        /\b(?:cache|redis|setcache|getcache|lru|ttl)\b/i,
      ],
      snippetPatterns: [
        /\b(?:cache\.get|cache\.set|redis|Map\(\)|max-age)\b/i,
      ],
    },
  },
];

