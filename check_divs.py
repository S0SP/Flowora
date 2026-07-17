import re

def check_divs(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        text = f.read()

    open_divs = len(re.findall(r'<div\b', text))
    close_divs = len(re.findall(r'</div>', text))
    
    print(f"Divs: {open_divs} open vs {close_divs} close")
    
    open_span = len(re.findall(r'<span\b', text))
    close_span = len(re.findall(r'</span>', text))
    
    print(f"Spans: {open_span} open vs {close_span} close")

check_divs('src/components/lead-capture/lead-capture-client.tsx')
