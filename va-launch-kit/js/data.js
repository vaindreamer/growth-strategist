/* Static content for the VA Momma Launch Kit. Edit these lists to customize the product. */
window.KIT = {
  services: [
    'Inbox Management', 'Calendar & Scheduling', 'Data Entry', 'Customer Support',
    'Social Media Management', 'Canva Graphic Design', 'Content Scheduling', 'Lead Generation',
    'Online Research', 'Bookkeeping Support', 'E-commerce / Shopify Support', 'Email Marketing',
    'Travel & Event Planning', 'Transcription', 'Project Management', 'Podcast / YouTube Support'
  ],

  tools: [
    'Google Workspace', 'Microsoft 365', 'Canva', 'Trello', 'Asana', 'ClickUp', 'Notion', 'Slack',
    'Zoom', 'Calendly', 'QuickBooks', 'Xero', 'Shopify', 'Meta Business Suite', 'Mailchimp',
    'HubSpot', 'Zendesk', 'Later / Buffer', 'ChatGPT / AI tools', 'Loom'
  ],

  // Keywords used to match a job post to a service (lower-case).
  serviceKeywords: {
    'Inbox Management': ['inbox', 'email management', 'emails', 'gmail', 'outlook'],
    'Calendar & Scheduling': ['calendar', 'schedul', 'appointment', 'booking', 'meetings'],
    'Data Entry': ['data entry', 'spreadsheet', 'excel', 'google sheets', 'crm update', 'input data'],
    'Customer Support': ['customer service', 'customer support', 'tickets', 'live chat', 'support inbox', 'customer inquiries'],
    'Social Media Management': ['social media', 'instagram', 'facebook', 'tiktok', 'linkedin', 'engagement'],
    'Canva Graphic Design': ['canva', 'graphics', 'design', 'templates', 'carousel'],
    'Content Scheduling': ['scheduling posts', 'schedule posts', 'content calendar', 'later', 'buffer', 'planoly'],
    'Lead Generation': ['lead gen', 'leads', 'prospect', 'outreach', 'cold email', 'apollo'],
    'Online Research': ['research', 'find information', 'compile'],
    'Bookkeeping Support': ['bookkeeping', 'quickbooks', 'xero', 'invoices', 'invoicing', 'expenses', 'receipts'],
    'E-commerce / Shopify Support': ['shopify', 'ecommerce', 'e-commerce', 'amazon', 'etsy', 'product listing', 'orders'],
    'Email Marketing': ['newsletter', 'mailchimp', 'klaviyo', 'email campaign', 'flodesk', 'convertkit'],
    'Travel & Event Planning': ['travel', 'itinerary', 'event', 'flights', 'hotel'],
    'Transcription': ['transcri', 'notes', 'minutes'],
    'Project Management': ['project management', 'asana', 'trello', 'clickup', 'monday', 'deadlines', 'sop'],
    'Podcast / YouTube Support': ['podcast', 'youtube', 'show notes', 'video upload', 'thumbnails']
  },

  // Mom Skills Translator: honest life experience → client-facing wording.
  translator: [
    { id: 'sched', mom: 'I juggle my family\'s schedules, school events and appointments', pro: 'Coordinating calendars and appointments for several people at once, and avoiding double-bookings' },
    { id: 'budget', mom: 'I run the household budget and keep track of bills', pro: 'Budget tracking, bill-payment reminders and expense records' },
    { id: 'events', mom: 'I\'ve planned parties, school events or church activities', pro: 'Event planning: vendors, guest lists, timelines and follow-ups' },
    { id: 'groupchat', mom: 'I manage a parents\' group chat or community page', pro: 'Community management and clear, friendly written communication' },
    { id: 'reselling', mom: 'I\'ve sold items online (Shopee, Lazada, Facebook Marketplace, Etsy)', pro: 'Product listings, customer messages and order tracking for an online store' },
    { id: 'teaching', mom: 'I\'ve homeschooled, tutored or helped kids with modules', pro: 'Writing step-by-step instructions and checklists people can follow on their own' },
    { id: 'multitask', mom: 'I handle many tasks at once without dropping the ball', pro: 'Prioritizing competing tasks and meeting deadlines with little supervision' },
    { id: 'research', mom: 'I research everything: schools, doctors, best deals', pro: 'Online research, comparing options and writing short summaries for decisions' },
    { id: 'meal', mom: 'I plan meals, grocery lists and household routines', pro: 'Building repeatable systems and routines (SOPs) that save time' },
    { id: 'calm', mom: 'I stay calm with toddlers, so difficult customers are easy', pro: 'Patient, solution-focused handling of difficult customer situations' }
  ],

  sample: {
    fullName: 'Maria Santos',
    email: 'maria.santos.va@gmail.com',
    location: 'Cebu, Philippines',
    phone: '',
    availability: '25 hrs/week, overlapping US Eastern mornings',
    rate: '7',
    portfolioUrl: '',
    linkedin: '',
    photoUrl: '',
    niche: 'busy coaches and course creators',
    headline: '',
    summary: '',
    services: ['Inbox Management', 'Calendar & Scheduling', 'Canva Graphic Design', 'Content Scheduling', 'Customer Support'],
    tools: ['Google Workspace', 'Canva', 'Trello', 'Calendly', 'Meta Business Suite', 'Loom'],
    translator: ['sched', 'groupchat', 'reselling', 'multitask'],
    experience: [
      {
        role: 'Customer Service Representative', org: 'Teleperformance (BPO)', dates: '2017 – 2020',
        bullets: 'Resolved 60+ US customer emails and chats per day with a 94% satisfaction score\nTrained 8 new hires on ticketing workflows and response templates\nKept customer records accurate in Salesforce'
      },
      {
        role: 'Online Seller (Family Business)', org: 'Self-employed', dates: '2021 – Present',
        bullets: 'Listed 150+ products on Shopee and Facebook Marketplace with Canva photos\nAnswered buyer questions within 1 hour and tracked orders in Google Sheets'
      }
    ],
    projects: [
      { title: 'Inbox Zero System for a Coach', link: '', desc: 'Built a Gmail label + filter system and canned replies that sorts 200 sample emails into 6 action folders.', result: 'Cut sorting time to under 10 minutes a day' },
      { title: '2-Week Instagram Content Calendar', link: '', desc: '10 branded Canva posts and captions for a wellness coach, scheduled in Meta Business Suite.', result: 'Ready-to-post content for 14 days' },
      { title: 'Client Onboarding SOP', link: '', desc: 'Step-by-step Google Doc + Loom video for onboarding a new coaching client: contract, invoice, welcome email, calendar invite.', result: 'Onboarding steps cut from 9 to 5' }
    ],
    certifications: 'Google Workspace Essentials – Coursera, 2026\nCanva Design School: Social Media Design, 2026',
    education: 'BS Business Administration – University of San Carlos'
  }
};
