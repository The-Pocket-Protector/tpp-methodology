// Every identifier, name, location, and amount here is invented.
export const landscapeHeaders = [
  'Contract ID', 'Plan ID', 'Segment ID', 'State Territory Abbreviation', 'County Name',
  'Plan Name', 'Organization Marketing Name', 'Plan Type', 'Special Needs Plan (SNP) Indicator',
  'SNP Type', 'Part D Coverage Indicator', 'Annual Part D Deductible Amount', 'Part D Total Premium',
  'Part C Premium', 'Monthly Consolidated Premium (Part C + D)', 'In-Network Maximum Out-of-Pocket (MOOP) Amount',
  'Part C Summary Star Rating', 'Part D Summary Star Rating', 'Overall Star Rating', 'Contract Year',
];
export const landscapeRow = ['H0000', '001', '0', 'ZZ', 'Example', 'Synthetic Plan', 'Synthetic Organization', 'HMO', 'No', '', 'Yes', '150', '5', '15', '20', '5000', '4', '4', '4', '2026'];
export const csv = rows => rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n');
export const landscapeCsv = csv([landscapeHeaders, landscapeRow]);
export const nadacCsv = 'NDC,NDC Description,NADAC Per Unit,Effective Date,Pricing Unit\n00000000001,"Synthetic, example drug",10,01/01/2026,EA\n,Missing identifier,5,01/01/2026,EA';
export const mfpHeaders = ['NDC-11', 'Selected Drug Name', 'IPAY', 'MFP Effective Date', 'MFP End Date', 'Single MFP per 30 DES', 'NDC-9 MFP per Unit Price'];
export const mfpRow = ['00000-0000-01', 'Synthetic Example', '2026', '01/01/2026', '', '300', '10'];
export const mfpCsv = csv([mfpHeaders, mfpRow]);
export const expectedSyntheticFamilies = { 2026: ['SYNTHETIC EXAMPLE'] };
