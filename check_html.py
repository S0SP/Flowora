from html.parser import HTMLParser

class MyHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []

    def handle_starttag(self, tag, attrs):
        # void elements
        if tag in ['img', 'br', 'hr', 'input', 'meta', 'link', 'circle', 'path', 'rect', 'line', 'polyline', 'polygon']:
            return
        self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        # We might have self-closing tags like <div /> which the HTMLParser might see as start tag then end tag,
        # or it might not. Wait, html.parser does not handle <Foo /> properly if it's not a known void element.
        # But we only care about div anyway.
        if tag == 'div':
            for i in range(len(self.stack)-1, -1, -1):
                if self.stack[i][0] == 'div':
                    self.stack.pop(i)
                    return
            print(f"Extra closing </div> at {self.getpos()}")

    def check(self):
        divs = [pos for tag, pos in self.stack if tag == 'div']
        print(f"Unclosed divs: {len(divs)}")
        for pos in divs:
            print(f"  Line {pos[0]}")

parser = MyHTMLParser()
with open('src/components/lead-capture/lead-capture-client.tsx', 'r', encoding='utf-8') as f:
    # Quick hack to make HTML parser not choke on JSX
    content = f.read()
    # Replace self closing divs
    content = content.replace('<div />', '<div></div>')
    # Or just run it
    parser.feed(content)
    parser.check()
