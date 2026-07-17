const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else if (dirPath.endsWith('.tsx') || dirPath.endsWith('.ts')) {
      callback(path.join(dir, f));
    }
  });
}

const dirsToProcess = ['./src/app/dashboard', './src/components'];

dirsToProcess.forEach(dir => {
  if (fs.existsSync(dir)) {
    walkDir(dir, function(filePath) {
      let content = fs.readFileSync(filePath, 'utf-8');
      const original = content;

      // Replace bg-white with bg-background generally, but for modals/cards it should be bg-card.
      // Since it's hard to distinguish without AI, we'll replace bg-white with bg-background.
      // In globals.css, --background and --card are configured well for dark mode.
      content = content.replace(/\bbg-white\b/g, 'bg-background');
      
      // Grays to semantics
      content = content.replace(/\bbg-gray-50\b/g, 'bg-muted/50');
      content = content.replace(/\bbg-gray-100\b/g, 'bg-muted');
      content = content.replace(/\bbg-slate-50\b/g, 'bg-muted/50');
      content = content.replace(/\bbg-slate-100\b/g, 'bg-muted');

      content = content.replace(/\bbg-gray-200\b/g, 'bg-accent');
      
      content = content.replace(/\btext-gray-900\b/g, 'text-foreground');
      content = content.replace(/\btext-gray-800\b/g, 'text-foreground');
      content = content.replace(/\btext-gray-700\b/g, 'text-muted-foreground');
      content = content.replace(/\btext-gray-600\b/g, 'text-muted-foreground');
      content = content.replace(/\btext-gray-500\b/g, 'text-muted-foreground');
      
      content = content.replace(/\border-gray-100\b/g, 'border-border/50');
      content = content.replace(/\border-gray-200\b/g, 'border-border');
      content = content.replace(/\border-gray-300\b/g, 'border-border');
      
      // Slate to semantics
      content = content.replace(/\btext-slate-900\b/g, 'text-foreground');
      content = content.replace(/\btext-slate-800\b/g, 'text-foreground');
      content = content.replace(/\btext-slate-700\b/g, 'text-muted-foreground');
      content = content.replace(/\btext-slate-600\b/g, 'text-muted-foreground');
      content = content.replace(/\btext-slate-500\b/g, 'text-muted-foreground');
      
      content = content.replace(/\border-slate-100\b/g, 'border-border/50');
      content = content.replace(/\border-slate-200\b/g, 'border-border');
      content = content.replace(/\border-slate-300\b/g, 'border-border');

      if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log('Fixed:', filePath);
      }
    });
  }
});
