import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  const jsCode = `(function() {
  const scriptTag = document.currentScript || document.querySelector('script[data-workspace-id]');
  if (!scriptTag) {
    console.error("Flowra Chat Widget: script tag not found or missing data-workspace-id attribute.");
    return;
  }
  const workspaceId = scriptTag.getAttribute('data-workspace-id');
  if (!workspaceId) {
    console.error("Flowra Chat Widget: Missing data-workspace-id attribute.");
    return;
  }

  if (window.__flowra_widget_loaded) return;
  window.__flowra_widget_loaded = true;

  const origin = "${origin}";

  fetch(origin + "/api/widget/config?ws=" + workspaceId)
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.error) {
        console.warn("Flowra Chat Widget:", data.error);
        return;
      }
      const config = data.config || {};
      const primaryColor = config.primaryColor || '#7c3aed';
      const position = config.position || 'right';

      const container = document.createElement('div');
      container.id = 'flowra-chat-widget-container';
      container.style.position = 'fixed';
      container.style.bottom = '20px';
      container.style[position] = '20px';
      container.style.zIndex = '999999';
      container.style.fontFamily = 'system-ui, -apple-system, sans-serif';

      const button = document.createElement('button');
      button.style.width = '60px';
      button.style.height = '60px';
      button.style.borderRadius = '30px';
      button.style.backgroundColor = primaryColor;
      button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      button.style.border = 'none';
      button.style.cursor = 'pointer';
      button.style.display = 'flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';
      button.style.transition = 'transform 0.2s ease';
      button.style.outline = 'none';

      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
      const closeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      button.innerHTML = svg;

      const iframe = document.createElement('iframe');
      iframe.src = origin + "/widget/chat?ws=" + workspaceId;
      iframe.style.position = 'absolute';
      iframe.style.bottom = '80px';
      iframe.style[position] = '0';
      iframe.style.width = '380px';
      iframe.style.height = '600px';
      iframe.style.maxHeight = 'calc(100vh - 120px)';
      iframe.style.maxWidth = 'calc(100vw - 40px)';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '16px';
      iframe.style.boxShadow = '0 8px 30px rgba(0,0,0,0.15)';
      iframe.style.display = 'none';
      iframe.style.opacity = '0';
      iframe.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      iframe.style.transform = 'translateY(10px)';

      container.appendChild(iframe);
      container.appendChild(button);
      document.body.appendChild(container);

      let isOpen = false;
      button.onclick = function() {
        isOpen = !isOpen;
        if (isOpen) {
          iframe.style.display = 'block';
          setTimeout(function() {
            iframe.style.opacity = '1';
            iframe.style.transform = 'translateY(0)';
          }, 10);
          button.innerHTML = closeSvg;
          button.style.transform = 'scale(0.9)';
        } else {
          iframe.style.opacity = '0';
          iframe.style.transform = 'translateY(10px)';
          setTimeout(function() {
            iframe.style.display = 'none';
          }, 200);
          button.innerHTML = svg;
          button.style.transform = 'scale(1)';
        }
      };
    })
    .catch(function(err) { console.error("Flowra Chat Widget failed to initialize:", err); });
})();`;

  return new NextResponse(jsCode, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
