/**
 * The content the portal shipped with as hardcoded arrays in src/main.jsx.
 *
 * Seeding it means the portal looks exactly as it did before, while every item
 * is now a real database record an administrator can edit, publish or remove.
 */

export const DEMO_SERVICES = [
  { name: 'Compliance Challenge', key: 'compliance-challenge', icon: 'ShieldCheck', tab: 'GENERAL', category: 'Compliance', description: 'Test and refresh your compliance knowledge.' },
  { name: 'Cyber Academy', key: 'cyber-academy', icon: 'GraduationCap', tab: 'GENERAL', category: 'Learning', description: 'Security awareness training and certification.' },
  { name: 'Ethics Box', key: 'ethics-box', icon: 'Scale', tab: 'GENERAL', category: 'Compliance', description: 'Confidential channel for ethics and conduct reports.' },
  { name: 'Material Formativo WorldLex', key: 'worldlex', icon: 'Globe2', tab: 'GENERAL', category: 'Learning', description: 'Legal training material across our markets.' },
  { name: 'Portal DATA', key: 'portal-data', icon: 'ChartNoAxesCombined', tab: 'GENERAL', category: 'Analytics', description: 'Operational dashboards and reporting.' },
  { name: 'Reserva de Recursos', key: 'reserva-de-recursos', icon: 'CalendarDays', tab: 'GENERAL', category: 'Workplace', description: 'Book meeting rooms, vehicles and shared equipment.' },
  { name: 'Employee self-service', key: 'employee-self-service', icon: 'ShieldCheck', tab: 'EMPLOYEE PORTAL', category: 'People', description: 'Payslips, personal details and certificates.' },
  { name: 'Leave & attendance', key: 'leave-attendance', icon: 'CalendarDays', tab: 'EMPLOYEE PORTAL', category: 'People', description: 'Request leave and review your attendance.' },
  { name: 'Learning portal', key: 'learning-portal', icon: 'GraduationCap', tab: 'EMPLOYEE PORTAL', category: 'Learning', description: 'Courses assigned to you and your team.' },
];

export const DEMO_NEWS = [
  { title: 'Declaration of Conflicts of Interest', date: '2026-10-30', scope: 'Global', category: 'GOVERNANCE', image: 'news-0.png', tags: ['Governance', 'Compliance'] },
  { title: 'Improper access to public tenders', date: '2026-10-28', scope: 'Global', category: 'COMPLIANCE', image: 'news-1.png', tags: ['Compliance', 'Legal'] },
  { title: 'Q3 Phishing Results', date: '2026-10-26', scope: 'Local', category: 'CYBERSECURITY', image: 'news-2.png', tags: ['Cybersecurity', 'Awareness'] },
  { title: 'Urbaser and Tadweer Group announce partnership', date: '2026-10-23', scope: 'Global', category: 'PARTNERSHIPS', image: 'news-3.png', tags: ['Partnerships', 'Growth'] },
  { title: 'Activate your passkey', date: '2026-10-22', scope: 'Global', category: 'SECURITY', image: 'news-4.png', tags: ['Cybersecurity', 'IT'] },
  { title: 'Cyber Family', date: '2026-10-13', scope: 'Global', category: 'PEOPLE', image: 'news-5.png', tags: ['Cybersecurity', 'Our people'] },
  { title: 'Eva Mª Fernández, Best Industry Professional', date: '2026-10-02', scope: 'Local', category: 'OUR PEOPLE', image: 'news-6.png', tags: ['Our people', 'Recognition'] },
  { title: 'How to respond to a Public Administration', date: '2026-09-30', scope: 'Global', category: 'COMPLIANCE', image: 'news-7.png', tags: ['Compliance', 'Legal'] },
];

export const DEMO_FOLDERS = [
  'Annual Results',
  'Certifications',
  'Code of Conduct',
  'Corporate Forms',
  'Corporate Identity',
  'Corporate Manuals',
  'Corporate Policies',
  'Corporate Procedures',
  'Orgchart by Country',
  'Project Move2Improve',
  'Records',
  'Regulation 0',
  'Social Networks',
  'Sustainability Report',
  'Corporate Organisational Chart',
];

export const DEMO_COUNTRIES = ['URBASER GROUP', 'INDIA', 'NORWAY'];

/** One document per folder per country, as the original UI implied. */
export const DEMO_DOCUMENT_PARTS = ['Overview', 'Guidelines', 'Reference information'];

export const DEMO_PEOPLE = [
  { name: 'Shezhian Karthiyamoorthi', email: 'shezhian.k@urbaser.local', department: 'Information Technology', country: 'India', jobTitle: 'IT Workspace Lead' },
  { name: 'Eva Fernández', email: 'eva.fernandez@urbaser.local', department: 'Operations', country: 'Spain', jobTitle: 'Operations Manager' },
  { name: 'Alex Morgan', email: 'alex.morgan@urbaser.local', department: 'Human Resources', country: 'Norway', jobTitle: 'People Partner' },
  { name: 'Priya Sharma', email: 'priya.sharma@urbaser.local', department: 'Sustainability', country: 'India', jobTitle: 'Sustainability Analyst' },
];

/**
 * Options the portal genuinely reads at runtime — changing one in the admin
 * changes the rendered page, which is the point of the module.
 */
export const DEMO_OPTIONS = [
  { name: 'Brand name', key: 'portal.brand_name', type: 'text' as const, defaultValue: 'urbaser', description: 'First word of the sidebar wordmark.', module: 'portal', isPublic: true },
  { name: 'Brand suffix', key: 'portal.brand_suffix', type: 'text' as const, defaultValue: 'connect', description: 'Highlighted second word of the sidebar wordmark.', module: 'portal', isPublic: true },
  { name: 'Hero tagline', key: 'portal.hero_tagline', type: 'text' as const, defaultValue: 'BETTER, TOGETHER', description: 'Small label above the hero headline.', module: 'portal', isPublic: true },
  { name: 'Hero headline', key: 'portal.hero_title', type: 'text' as const, defaultValue: 'A world of possibilities.', description: 'First line of the hero headline.', module: 'portal', isPublic: true },
  { name: 'Hero headline accent', key: 'portal.hero_title_accent', type: 'text' as const, defaultValue: 'One connected team.', description: 'Second, highlighted line of the hero headline.', module: 'portal', isPublic: true },
  { name: 'Hero subtitle', key: 'portal.hero_subtitle', type: 'text' as const, defaultValue: 'Everything you need to do your best work, right where you belong.', description: 'Paragraph under the hero headline.', module: 'portal', isPublic: true },
  { name: 'News per page', key: 'portal.news_page_size', type: 'number' as const, defaultValue: 4, description: 'How many news cards appear on one page.', module: 'portal', isPublic: true, validation: { min: 1, max: 24, required: true } },
  { name: 'Show quick access', key: 'portal.quick_access_enabled', type: 'boolean' as const, defaultValue: true, description: 'Show the quick access shortcut row under the hero.', module: 'portal', isPublic: true },
  { name: 'Enable people search', key: 'portal.people_search_enabled', type: 'boolean' as const, defaultValue: true, description: 'Enable the people directory and the Command/Ctrl + K shortcut.', module: 'portal', isPublic: true },
  { name: 'Default theme', key: 'portal.default_theme', type: 'select' as const, defaultValue: 'system', description: 'Theme used on a first visit, before the visitor chooses one.', module: 'portal', isPublic: true, choices: [{ label: 'Follow device', value: 'system' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }] },
  { name: 'Footer note', key: 'portal.footer_note', type: 'text' as const, defaultValue: 'Connected by purpose. Powered by people.', description: 'Text in the portal footer.', module: 'portal', isPublic: true },
  { name: 'Sidebar highlight', key: 'portal.sidebar_note', type: 'json' as const, defaultValue: { title: 'One world. Connected.', body: 'Your people, knowledge and tools. A little closer.', cta: 'Find your people' }, description: 'Headline, text and button label of the sidebar highlight card.', module: 'portal', isPublic: true },
];
