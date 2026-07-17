const fs = require('fs');
const path = require('path');

const files = [
  'src/app/dashboard/analytics/page.tsx',
  'src/app/dashboard/broadcasts/page.tsx',
  'src/app/dashboard/campaigns/page.tsx',
  'src/app/dashboard/chatbot/page.tsx',
  'src/app/dashboard/contacts/page.tsx',
  'src/app/dashboard/inbox/page.tsx',
  'src/app/dashboard/knowledge/page.tsx',
  'src/app/dashboard/leads/page.tsx',
  'src/app/dashboard/settings/page.tsx',
  'src/app/dashboard/team/page.tsx',
  'src/app/dashboard/tickets/page.tsx',
  'src/app/dashboard/voice/page.tsx',
  'src/app/dashboard/voice-agent/voices/page.tsx',
  'src/app/dashboard/workflows/builder/page.tsx',
  'src/app/dashboard/workflows/page.tsx',
  'src/components/contacts/contact-sidebar.tsx',
  'src/components/contacts/contacts-table.tsx',
  'src/components/lead-capture/lead-capture-client.tsx',
  'src/components/organisms/KanbanBoard.tsx',
  'src/components/organisms/Topbar.tsx',
  'src/components/settings/DealsSettingsPanel.tsx',
  'src/components/settings/TagsAndFieldsPanel.tsx',
  'src/components/settings/TemplateManagerPanel.tsx',
  'src/components/settings/WhatsAppConnectPanel.tsx',
  'src/components/tickets/ticket-detail-client.tsx',
  'src/components/ui/custom-select.tsx',
  'src/components/ui/toggle.tsx'
];

files.forEach(f => {
  const filePath = path.join(__dirname, f);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const original = content;

    // Inverse of what fix-dark-mode.js did:
    content = content.replace(/\bbg-background\b/g, 'bg-white');
    content = content.replace(/\bbg-muted\/50\b/g, 'bg-gray-50');
    content = content.replace(/\bbg-muted\b/g, 'bg-gray-100');
    content = content.replace(/\bbg-accent\b/g, 'bg-gray-200');
    
    // We originally mapped 800 and 900 to foreground. 
    // Reverting to 900 is safer.
    content = content.replace(/\btext-foreground\b/g, 'text-gray-900');
    
    // We originally mapped 700, 600, 500 to muted-foreground.
    // Reverting to 500 is safer.
    content = content.replace(/\btext-muted-foreground\b/g, 'text-gray-500');
    
    // Borders
    content = content.replace(/\border-border\/50\b/g, 'border-gray-100');
    content = content.replace(/\border-border\b/g, 'border-gray-200');

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log('Reverted:', filePath);
    }
  }
});
