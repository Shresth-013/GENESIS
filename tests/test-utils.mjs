import JSZip from 'jszip';

export function createSamplePdfBuffer(customText = 'GENESIS Requirement Specification: The system shall authenticate users with password.') {
  const streamContent = `BT\n/F1 12 Tf\n72 712 Td\n(${customText.replace(/[()\\]/g, '')}) Tj\nET\n`;
  const streamLength = Buffer.byteLength(streamContent, 'utf8');

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${streamContent}endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000409 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
486
%%EOF
`;
  return Buffer.from(pdf, 'utf8');
}

export async function createSampleDocxBuffer(customText = 'GENESIS Requirement Specification: The system shall support multi-factor authentication and store audit logs securely.') {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${customText}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`
  );

  return await zip.generateAsync({ type: 'nodebuffer' });
}

export const MOCK_GEMINI_REQUIREMENTS = {
  requirements: [
    {
      temporary_id: 'REQ-001',
      description: 'The system shall allow registered users to log in securely with multi-factor authentication.',
      category: 'FUNCTIONAL',
      priority: 'HIGH',
      type: 'FUNCTIONAL_REQUIREMENT',
      source_reference: {
        page: 1,
        section: 'User Authentication',
      },
      acceptance_criteria: [
        'User submits valid email and password.',
        'System sends a 6-digit OTP to user mobile or email.',
      ],
      confidence: 'HIGH',
      extraction_notes: '',
    },
    {
      temporary_id: 'REQ-002',
      description: 'All sensitive client health records must be encrypted at rest using AES-256.',
      category: 'SECURITY',
      priority: 'CRITICAL',
      type: 'SECURITY_REQUIREMENT',
      source_reference: {
        page: 2,
        section: 'Data Protection and HIPAA Compliance',
      },
      acceptance_criteria: [
        'Database files on disk are unreadable in plaintext.',
        'Master encryption key is managed via KMS.',
      ],
      confidence: 'HIGH',
      extraction_notes: '',
    },
    {
      temporary_id: 'REQ-003',
      description: 'System response latency for clinical search queries shall not exceed 1.5 seconds under 500 concurrent users.',
      category: 'PERFORMANCE',
      priority: 'MEDIUM',
      type: 'PERFORMANCE_REQUIREMENT',
      source_reference: {
        page: 3,
        section: 'System Scalability',
      },
      acceptance_criteria: [
        '95th percentile response time is under 1500ms during stress testing.',
      ],
      confidence: 'MEDIUM',
      extraction_notes: 'Target hardware environment not specified in document text.',
    },
  ],
};

